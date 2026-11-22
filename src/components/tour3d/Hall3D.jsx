import { Html, OrbitControls, Text } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { buildRoutes, heatInfo } from '../../utils/metrics'

// Координаты зала (x, y) → Three (x, z). Ось Y — вверх.
const to3 = (p, h = 0.05) => new THREE.Vector3(p[0], h, p[1])

function Table({ node, workshop, takt, selected, onSelect }) {
  const mesh = useRef()
  const load = node.load_percent ?? (takt ? (node.cycle_time_sec / takt) * 100 : 0)
  const heat = heatInfo(load)
  const w = workshop.table_w_m ?? 1
  const d = workshop.table_d_m ?? 0.7
  const h = workshop.table_h_m ?? 0.82
  const isOp = node.kind === 'operation' || node.kind === 'control'

  useFrame(({ clock }) => {
    if (!mesh.current) return
    const mat = mesh.current.material
    if (node.is_bottleneck || heat.pulse) {
      mat.emissiveIntensity = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 4)
    } else {
      mat.emissiveIntensity = selected ? 0.5 : 0.15
    }
  })

  if (!isOp) return null
  return (
    <group position={[node.pos_x_m, 0, node.pos_y_m]}>
      <mesh
        ref={mesh}
        position={[0, h / 2, 0]}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(node)
        }}
        castShadow
      >
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={heat.color} emissive={heat.color} emissiveIntensity={0.2} />
      </mesh>
      {selected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.8, 0.9, 32]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      )}
      <Html position={[0, h + 0.45, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div className={`t3d-label${node.is_bottleneck ? ' is-bottleneck' : ''}`}>
          <b>
            №{node.step_number} · {node.name}
          </b>
          <span>
            {Math.round(node.cycle_time_sec)} с · {Math.round(load)}%
          </span>
          {node.is_bottleneck && <em>Узкое место</em>}
        </div>
      </Html>
    </group>
  )
}

function Zone({ pos, label, color }) {
  return (
    <group position={[pos[0], 0, pos[1]]}>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.8, 1.4]} />
        <meshStandardMaterial color={color} transparent opacity={0.55} />
      </mesh>
      <Text position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.28} color="#fff">
        {label}
      </Text>
    </group>
  )
}

function Route({ route, color, speed = 1 }) {
  const curve = useMemo(() => {
    const pts = route.pts.map((p) => to3(p, 0.12))
    return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.02)
  }, [route])
  const geo = useMemo(() => new THREE.TubeGeometry(curve, 48, 0.035, 6, false), [curve])
  // Ручные THREE-объекты не управляются R3F — освобождаем GPU-ресурсы при размонтировании
  // (важно для StrictMode dev-перемонтирования, иначе утечка геометрии).
  useEffect(() => () => geo.dispose(), [geo])
  const dot = useRef()
  const dot2 = useRef()
  useFrame(({ clock }) => {
    const t = (clock.elapsedTime * 0.12 * speed) % 1
    const u = route.pingPong ? 1 - Math.abs(2 * t - 1) : t
    if (dot.current) dot.current.position.copy(curve.getPoint(u))
    const t2 = (t + 0.5) % 1
    const u2 = route.pingPong ? 1 - Math.abs(2 * t2 - 1) : t2
    if (dot2.current) dot2.current.position.copy(curve.getPoint(u2))
  })
  return (
    <group>
      <mesh geometry={geo}>
        <meshBasicMaterial color={color} transparent opacity={0.55} />
      </mesh>
      <mesh ref={dot}>
        <sphereGeometry args={[0.1, 12, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh ref={dot2}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshBasicMaterial color="#fff" />
      </mesh>
    </group>
  )
}

export default function Hall3D({ workshop, takt, showHeat, showSpaghetti, selectedId, onSelect }) {
  const W = workshop.width_m ?? 6.15
  const L = workshop.length_m ?? 18.4
  const routes = useMemo(() => buildRoutes(workshop), [workshop])
  // Контур пола создаётся один раз и освобождается при размонтировании (иначе утечка на каждый рендер).
  const floorEdges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(W, 0.02, L)), [W, L])
  useEffect(() => () => floorEdges.dispose(), [floorEdges])
  const nodes = workshop.nodes ?? []
  const wh = nodes.find((n) => n.kind === 'warehouse')
  const cl = nodes.find((n) => n.kind === 'client')
  // Тепловая карта выключена: нейтральные столы.
  const view = showHeat
    ? nodes
    : nodes.map((n) => ({ ...n, load_percent: 60, is_bottleneck: false }))

  return (
    <Canvas shadows camera={{ position: [W * 2.2, 14, L * 0.5], fov: 50 }} onPointerMissed={() => onSelect(null)}>
      <color attach="background" args={['#0b1220']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[8, 14, 6]} intensity={1.1} castShadow />
      <pointLight position={[W / 2, 5, L / 2]} intensity={0.6} />
      <mesh position={[W / 2, 0, L / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W, L]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      <gridHelper args={[Math.max(W, L), Math.max(W, L), '#475569', '#334155']} position={[W / 2, 0.01, L / 2]} />
      <lineSegments position={[W / 2, 0.02, L / 2]} geometry={floorEdges}>
        <lineBasicMaterial color="#38bdf8" />
      </lineSegments>
      <Zone pos={[wh?.pos_x_m ?? 3, wh?.pos_y_m ?? 17.5]} label="СКЛАД" color="#0369a1" />
      <Zone pos={[cl?.pos_x_m ?? 1.8, cl?.pos_y_m ?? 1.5]} label="КЛИЕНТ" color="#15803d" />
      {view.map((n) => (
        <Table
          key={n.id}
          node={n}
          workshop={workshop}
          takt={takt}
          selected={selectedId === n.id}
          onSelect={onSelect}
        />
      ))}
      {showSpaghetti && (
        <>
          {routes.logist.map((r) => (
            <Route key={r.id} route={r} color="#f59e0b" speed={1.2} />
          ))}
          {routes.flow.map((r) => (
            <Route key={r.id} route={r} color="#22d3ee" speed={0.8} />
          ))}
        </>
      )}
      <OrbitControls target={[W / 2, 0, L / 2]} maxPolarAngle={Math.PI / 2.05} />
    </Canvas>
  )
}
