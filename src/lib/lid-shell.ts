import {
  AmbientLight, BufferGeometry, DirectionalLight, ExtrudeGeometry, Mesh, MeshPhongMaterial,
  PerspectiveCamera, PointLight, Scene, Shape, WebGLRenderer,
} from "three"

// All model and camera coordinates are CSS pixels. The glass lies in z=0,
// and the line y=z=0 runs through the actual lower edge of the glass.
export function createLidShell(canvas: HTMLCanvasElement) {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" })
  renderer.setClearColor(0, 0)
  const scene = new Scene()
  const camera = new PerspectiveCamera()
  const metal = new MeshPhongMaterial({ color: 0x44464a, specular: 0x505358, shininess: 52 })
  const lid = new Mesh(new BufferGeometry(), metal)
  scene.add(lid, new AmbientLight(0xffffff, 0.7))
  const fill = new DirectionalLight(0xe1e9f5, 1.25)
  fill.position.set(0.3, 0.9, 0.7)
  const softbox = new PointLight(0xfff5eb, 1, 0, 2)
  scene.add(fill, softbox)
  let fold = 1

  function draw(value: number) {
    fold = value
    lid.rotation.x = value * Math.PI / 2
    renderer.render(scene, camera)
  }

  function resize(width: number, height: number, radius: number, distance: number) {
    const thickness = width * 8 / 960
    const bevel = thickness * 0.23
    const x = width / 2 - bevel
    const bottom = bevel
    const top = height - bevel
    const r = radius - bevel
    const shape = new Shape()
    shape.moveTo(x - r, top)
    shape.absarc(x - r, top - r, r, Math.PI / 2, 0, true)
    shape.lineTo(x, bottom + r)
    shape.absarc(x - r, bottom + r, r, 0, -Math.PI / 2, true)
    shape.lineTo(-x + r, bottom)
    shape.absarc(-x + r, bottom + r, r, -Math.PI / 2, -Math.PI, true)
    shape.lineTo(-x, top - r)
    shape.absarc(-x + r, top - r, r, Math.PI, Math.PI / 2, true)
    shape.closePath()
    lid.geometry.dispose()
    lid.geometry = new ExtrudeGeometry(shape, {
      depth: thickness - 2 * bevel, bevelThickness: bevel, bevelSize: bevel,
      bevelSegments: 5, curveSegments: 16,
    })
    lid.geometry.translate(0, 0, -thickness + bevel)

    // Off-axis frustum: the perspective origin of the HTML screen is the hinge.
    const padX = Math.ceil(width / 2 * height / (distance - height)) + 2
    const padY = Math.ceil(thickness * 2) + 2
    const w = width + 2 * padX
    const h = height + 2 * padY
    Object.assign(canvas.style, {
      left: `-${padX}px`, top: `-${padY}px`, width: `${w}px`, height: `${h}px`,
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(w, h, false)
    camera.position.z = distance
    const near = distance - height - 2 * thickness
    const scale = near / distance
    camera.projectionMatrix.makePerspective(-w / 2 * scale, w / 2 * scale,
      (height + padY) * scale, -padY * scale, near, distance + 2 * thickness)
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
    softbox.position.set(-width * 0.48, height * 1.25, height * 1.6)
    softbox.intensity = height * height * 2.6
    draw(fold)
  }

  return {
    draw, resize,
    dispose() {
      lid.geometry.dispose()
      metal.dispose()
      renderer.dispose()
    },
  }
}
