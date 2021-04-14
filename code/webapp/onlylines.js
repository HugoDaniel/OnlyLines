import { State, Line } from "./state.js"
import * as PIXI from "pixi.js"
import Verb from "./external/verb.min.js"
import Assert from "./asserts.js"

window.onload = () => {
  const view = new View()
  const s = new State(window.innerWidth, window.innerHeight)
  window.location.hash = s.actorId

  view.initialize(s)

}

class Action {
  start = [0, 0]
  at = [0, 0]
  name = undefined
  data = undefined
  constructor(startX, startY, name, data) {
    Assert.isNumber(startX, `Cannot start action ${this.name}, invalid startX`)
    Assert.isNumber(startY, `Cannot start action ${this.name}, invalid startY`)
    this.start[0] = startX
    this.start[1] = startY
    this.name = name
    this.data = data
  }

  update(x, y) {
    Assert.isNumber(x, "Cannot update action ${this.name}, invalid startX")
    Assert.isNumber(y, "Cannot update action ${this.name}, invalid startY")
    this.at[0] = x 
    this.at[1] = y
    switch(this.name) {
      case Action.CreateLineEnum: this.updateCreateLine(); break;
      case Action.UpdateLineEnum: this.updateLinePosition(); break;
    }
  }

  updateCreateLine() {
    this.data.line.x2 = this.at[0]
    this.data.line.y2 = this.at[1]
  }

  updateLinePosition() {
    if (this.data.updateLineAt === "start") {
      this.data.line.x1 = this.at[0]
      this.data.line.y1 = this.at[1]
    } else if (this.data.updateLineAt === "end") {
      this.data.line.x2 = this.at[0]
      this.data.line.y2 = this.at[1] 
    } else {
      const movementX = this.at[0] - this.start[0]
      const movementY = this.at[1] - this.start[1]
      this.data.line.x1 -= this.data.delta[0] - movementX
      this.data.line.y1 -= this.data.delta[1] - movementY
      this.data.line.x2 -= this.data.delta[0] - movementX
      this.data.line.y2 -= this.data.delta[1] - movementY
      this.data.delta[0] = movementX
      this.data.delta[1] = movementY
    }
  }

  static CreateLineEnum = "CreateLine"
  static CreateLine = (startX, startY, line) => 
    new Action(startX, startY, Action.CreateLineEnum,
      { line: new Line(line) }
    )

  static UpdateLineEnum = "UpdateLine"
  static UpdateLine = (startX, startY, { line }, w, h) => {
    const threshold = 64 // distance considered "near" to an edge

    const edgesData = line.edgesFor(w, h)
    const edges = new Line([line.id, edgesData[0], edgesData[1]])
    // edges.id = line.id
    line.x1 = edges.x1
    line.x2 = edges.x2
    line.y1 = edges.y1
    line.y2 = edges.y2

    const distToStart = Math.hypot(edges.x1 - startX, edges.y1 - startY)
    // A line can be updated my moving it (center), or by changing
    // one of its edges 
    let updateLineAt = "center"
    if (distToStart <= threshold) {
      updateLineAt = "start"
    } else {
      const distToEnd = Math.hypot(edges.x2 - startX, edges.y2 - startY)
      if (distToEnd <= threshold) {
        updateLineAt = "end"
      }
    }

    return (new Action(startX, startY, Action.UpdateLineEnum,
      { line, updateLineAt, delta: [0, 0] }
    ))
  }
}

class View {
  state = undefined
  // Array of all lines
  lines = undefined
  centerX = 0
  centerY = 0
  canvas = new Renderer(new PIXI.Application({
    antialias: true,
    resolution: window.devicePixelRatio,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundAlpha: 0
  }))

  initialize = (state) => {
    if (!state || !(state instanceof State)) {
      throw new Error(`Cannot initialize() the View without a valid state.\
        Please pass 'state' as an argument: ${state}`)
    }
    this.state = state
    this.state.view.onUpdate(this.refresh)

    // const w = window.innerWidth * window.devicePixelRatio
    // const h = window.innerHeight * window.devicePixelRatio

    this.centerX = window.innerWidth / 2
    this.centerY = window.innerHeight / 2

    const eventsTarget = document.body
    eventsTarget.addEventListener("touchstart", this.touchStart)
    eventsTarget.addEventListener("mousedown", this.touchStart)

    eventsTarget.addEventListener("touchmove", this.touchMove)
    eventsTarget.addEventListener("mousemove", this.touchMove)

    eventsTarget.addEventListener("touchend", this.touchEnd)
    eventsTarget.addEventListener("mouseup", this.touchEnd)
  }

  draw = () => {
  }

  nearestLine = (x, y) => {
    if (!Array.isArray(this.lines)) return
    let nearestDistance = Number.MAX_VALUE
    let line = undefined
    for(let i = 0; i < this.lines.length; i++) {
      let d = this.lines[i].distanceToPoint(x, y)
      if (d < nearestDistance) {
        line = this.lines[i]
        nearestDistance = d
      }
    }

    return ({ line, distance: nearestDistance })
  }

  touchState = undefined
  adjustTouchX = (x) => {
    return x - this.centerX
  }
  adjustTouchY = (y) => {
    return this.centerY - y
  }
  touchStart = (e) => {
    e.preventDefault()
    if (!this.state) {
      console.warn(`Cannot perform an action when the state is undefined`)
      return;
    }
    // Adjust for (0,0) to be in the middle
    const startX = this.adjustTouchX(e.clientX)
    const startY = this.adjustTouchY(e.clientY)

    // See if a line was selected
    const nearest = this.nearestLine(startX, startY)
    console.log('NEAREST', nearest)
    if (nearest && nearest.distance < 32) {
      // A line was selected
      // Find which part of the line is being moved
      this.touchState = Action.UpdateLine(startX, startY, nearest, window.innerWidth, window.innerHeight)
    } else {
      // A line is being created
      const line = this.state.addLine(startX, startY)
      this.touchState = Action.CreateLine(startX, startY, line) 

      // A line is always a full line
      this.canvas.animate = true
    }
  }
  touchMove = (e) => {
    e.preventDefault()
    if (!this.state) {
      console.warn(`Cannot perform a move action when the state is undefined`)
      return;
    }
    if (this.touchState === undefined) return

    // Adjust for (0,0) to be in the middle
    this.touchState.update(this.adjustTouchX(e.clientX),
      this.adjustTouchY(e.clientY))

    this.state.updateLine(this.touchState.data.line)
  }
  touchEnd = (e) => {
    e.preventDefault()
    if (!this.state) {
      console.warn(`Cannot finish an action when the state is undefined`)
      return;
    }
    this.touchState = undefined
    this.canvas.animate = true
    // TODO: Update relations
  }

  refresh = (view) => {
    // console.log('updating', view)
    this.lines = this.canvas.updateLines(view.lines)
    this.canvas.updatePoints(view.points)
  }
}

class Renderer {
  /** Map of the line id string to a Pixi Graphics() */
  fullLines = new Map()
  fullLinesDashes = new Map()
  /** Map of the point id string(relationid) to a Pixi Graphics() */
  points = new Map()
  width = window.innerWidth
  height = window.innerHeight
  halfWidth = this.width / 2
  halfHeight = this.height / 2
  diagonal = Math.hypot(this.width, this.height)
  animate = false
  /// Points Shader:
  pointsQuad = undefined
  pointsAvailablePow = 7 // 2^7 points to draw
  shaderData = undefined

  constructor(pixi) {
    if (!pixi || !(pixi instanceof PIXI.Application)) {
      throw new Error(`Creating a Renderer without a valid PixiJS instance ${pixi}`)
    }
    pixi.renderer.view.style.transform = `scale(${1/window.devicePixelRatio})`
    pixi.renderer.view.style.transformOrigin = "top left"
    console.log(pixi.renderer.view)
    this.app = pixi
    document.body.appendChild(this.app.view)
    this.app.stage.interactive = true
    this.createPointsShader()
    this.app.ticker.add(this.tickUpdateFullLineDashes)
  }

  tickUpdateFullLineDashes = () => {
    if (!this.animate) return
    for(const [lineId, dash] of this.fullLinesDashes.entries()) {
      dash.offset += 0.002

      this.dashesFor(lineId)
      this.renderFullLine(lineId)
    }
  }

  /**
   * Updates the lines passed on the array in the argument.
   **/
  updateLines(lines) {
    const result = []
    lines.forEach(line => {
      let graphics

      if (this.fullLines.has(line.id)) {
        graphics = this.fullLines.get(line.id)
      } else {
        graphics = new PIXI.Graphics()
        this.fullLines.set(line.id, graphics)
        this.app.stage.addChild(graphics);
      }
      this.dashesFor(line.id, line)
      this.renderFullLine(line.id)
      result.push(new Line([line.id, line.start, line.end]))
    })
    return result
  }

  updatePoints(points) {
    this.shaderData.totalPoints = points.length
    // Create Graphics for each relation
    points.forEach((pt, i) => {
      let graphics
      
      if (this.points.has(pt.id)) {
        graphics = this.points.get(pt.id)
      } else {
        graphics = new PIXI.Graphics()
        this.points.set(pt.id, graphics)
        this.app.stage.addChild(graphics);
      }
      this.renderPoint(pt, i)
    })
  }

  /** Adjust the point back to the pixijs graphics coordinate system */
  adjusted = new Array(2)
  adjustPoint(point) {
    this.adjusted[0] = point[0] + this.halfWidth
    this.adjusted[1] = this.halfHeight - point[1]
    return this.adjusted
  }
  adjustXY(x, y) {
    this.adjusted[0] = x + this.halfWidth
    this.adjusted[1] = this.halfHeight - y 
    return this.adjusted
  }

  renderPoint({ id, x, y }, index) {
    Assert.isStringId(id, "Cannot render a point")
    const graphics = this.points.get(id)
    if (!graphics || !(graphics instanceof PIXI.Graphics)) {
      throw new Error(`Cannot updated the point, invalid Graphics instance: ${graphics}`)
    }

    graphics.clear()
    graphics.lineStyle(2, 0xAFAEAE);
    graphics.beginFill(0xAFAEAE, 0.25);
    this.adjustXY(x, y)
    graphics.drawCircle(this.adjusted[0], this.adjusted[1], 10);
    graphics.endFill();

    this.shaderData.points[index * 2] = this.adjusted[0]
    this.shaderData.points[index * 2 + 1] = this.adjusted[1]
  }

  renderFullLine(lineId) {
    Assert.isStringId(lineId, "Cannot render a full line")
    if (!this.fullLinesDashes.has(lineId)) {
      throw new Error(`Cannot render a full line, no dashes set for lineId: ${lineId}`)
    }
    const graphics = this.fullLines.get(lineId)
    if (!graphics || !(graphics instanceof PIXI.Graphics)) {
      throw new Error(`Cannot updated the full line, invalid Graphics instance: ${graphics}`)
    }
    const { points } = this.fullLinesDashes.get(lineId)
    graphics.clear()
    graphics.lineStyle(2, 0xAFAEAE);
    for(let i = 0; i < points.length; i += 2) {
      const pt1 = points[i]
      const pt2 = points[i + 1]
      if (pt2) {
        this.adjustPoint(pt1)
        graphics.moveTo(this.adjusted[0], this.adjusted[1])
        this.adjustPoint(pt2)
        graphics.lineTo(this.adjusted[0], this.adjusted[1])
      }
    }
    /*
    this.adjustPoint(fullLine[0])
    graphics.moveTo(this.adjusted[0], this.adjusted[1])
    this.adjustPoint(fullLine[1])
    graphics.lineTo(this.adjusted[0], this.adjusted[1])
    graphics.beginFill(0x32DE49, 1);
    const pt1 = this.adjustPoint([0, 0])
    graphics.drawCircle(pt1[0], pt1[1], 20);
    graphics.endFill();
    graphics.beginFill(0xDE3249, 1);
    const pt2 = this.adjustPoint([100, 200])
    graphics.drawCircle(pt2[0], pt2[1], 20);
    graphics.endFill();
    */
    // graphics.filters = [new PIXI.filters.BlurFilter()]
  }

  dashesFor(id, line = undefined) {
    // Split the line into dashes
    let dashes
    const dashSize = 12
    const numberOfDashes = Math.round(this.diagonal / dashSize)
    if (this.fullLinesDashes.has(id) && !line) {
      dashes = this.fullLinesDashes.get(id)
      // Update the dashes points 
      Line.split(
        numberOfDashes,
        dashes.line.start,
        dashes.line.end,
        dashes.points,
        dashes.offset)
    } else {
      dashes =
        { points: Line.split(numberOfDashes, line.start, line.end)
        , offset: 0
        , line
        }
      this.fullLinesDashes.set(id, dashes)
    }

    return dashes
  }

  createPointsShader() {
    const w = this.width
    const h = this.height
    const dpr = window.devicePixelRatio
    const geometry = new PIXI.Geometry()
      .addAttribute('aVertexPosition',
        [ 0, 0,
          w, 0,
          w, h,
          0, h
        ], 2).addIndex([0, 1, 2, 0, 2, 3]);
    const numberOfPoints = Math.pow(2, this.pointsAvailablePow)
    const points = new Array(numberOfPoints).map(elem => -1)

    this.shaderData = { points, screen: [w, h, dpr, Math.hypot(w, h)], totalPoints: 0 };
    console.log(this.shaderData)

    const shader = PIXI.Shader.from(
///////////////////////////////////
// Vertex Shader
///////////////////////////////////
`#version 300 es

precision lowp float;
in vec2 aVertexPosition;

uniform mat3 translationMatrix;
uniform mat3 projectionMatrix;

void main() {
    gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
}`,
///////////////////////////////////

///////////////////////////////////
// Fragment Shader
///////////////////////////////////
`#version 300 es

precision mediump float;

    uniform vec4 screen;
    uniform ivec2 points[${numberOfPoints}];
    uniform int totalPoints;
    out vec4 color;

    void main() {
      vec2 pixel = vec2(gl_FragCoord.x, screen.y + (screen.y - gl_FragCoord.y));
      float size = 20.0 / screen.z;
      float d = 0.0;
      float field = 0.0;
      for(int i=0;i<totalPoints;i++) {
        // float field = (1.0 / (d0 * d0) + 1.0 / (d1 * d1) + 1.0 / (d2 * d2)) / 3.0;
        d = distance(pixel / screen.z, vec2(points[i]));
        field += 1.0 / (d * d);
      }

      // field = field / 3.0;

      /*
      color = d0 > size ?
        vec4(1.0) : vec4(0.0, 0.0, 0.0, 1.0);
      */
      color = field < 0.01 ?
        vec4(1.0, 1.0, 1.0, 0.0) : vec4(0.82, 0.87, 0.90, 1.0);
    }

    `
///////////////////////////////////
    , this.shaderData)


    const quad = new PIXI.Mesh(geometry, shader)
    quad.position.set(0, 0)
    if (this.pointsQuad) {
      this.app.stage.removeChild(this.pointsQuad)
    }
    this.pointsQuad = quad
    this.app.stage.addChild(this.pointsQuad);
/*
    this.app.ticker.add(() => {
      quad.rotation += 0.01;
    });
*/
  }
}
