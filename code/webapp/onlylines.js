import { State, Line } from "./state.js"
import * as PIXI from "pixi.js"
import Verb from "./external/verb.min.js"
import Assert from "./asserts.js"

window.onload = () => {
  const view = new View()
  const s = new State()

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
      const movementX = (this.at[0] - this.start[0])
      const movementY = (this.at[1] - this.start[1])
      this.data.line.x1 -= this.data.delta[0] - movementX
      this.data.line.y1 -= this.data.delta[1] - movementY
      this.data.line.x2 -= this.data.delta[0] - movementX
      this.data.line.y2 -= this.data.delta[1] - movementY
      this.data.delta[0] = movementX
      this.data.delta[1] = movementY
    }
  }

  static CreateLineEnum = "CreateLine"
  static CreateLine = (startX, startY) => 
    new Action(startX, startY, Action.CreateLineEnum,
      { line: new Line([
          [startX, startY], [0, 0]
        ])
      }
    )

  static UpdateLineEnum = "UpdateLine"
  static UpdateLine = (startX, startY, { line }, w, h) => {
    const threshold = 64 // distance considered "near" to an edge

    const edges = new Line(line.edgesFor(w, h))
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
        console.log('NEAR END OF LINE')
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
    this.state.onChange(this.refresh)

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

  nearestLine = (pt) => {
    if (!Array.isArray(this.lines)) return
    let nearestDistance = Number.MAX_VALUE
    let line = undefined
    for(let i = 0; i < this.lines.length; i++) {
      let d = this.lines[i].distanceToPoint(pt)
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
    const nearest = this.nearestLine([startX, startY])
    if (nearest && nearest.distance < 16) {
      // A line was selected
      // Find which part of the line is being moved
      this.touchState = Action.UpdateLine(startX, startY, nearest, window.innerWidth, window.innerHeight)
    } else {
      // A line is being created
      this.touchState = Action.CreateLine(startX, startY) 

      // A line is always a full line
      this.state.addFullLine(this.touchState.data.line)
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

    this.state.updateFullLine(this.touchState.data.line)
  }
  touchEnd = (e) => {
    e.preventDefault()
    if (!this.state) {
      console.warn(`Cannot finish an action when the state is undefined`)
      return;
    }
    // TODO: create line in state and refresh view
    this.touchState = undefined
    this.canvas.animate = true
  }

  refresh = (doc) => {
    this.lines = doc.fullLines.map(l => new Line(l))
    this.canvas.updateLines(doc.fullLines)
  }
}

class Renderer {
  // Map of the line id string to a Pixi Graphics()
  fullLines = new Map()
  fullLinesDashes = new Map()
  width = window.innerWidth
  height = window.innerHeight
  halfWidth = this.width / 2
  halfHeight = this.height / 2
  diagonal = Math.hypot(this.width, this.height)
  animate = false

  constructor(pixi) {
    if (!pixi || !(pixi instanceof PIXI.Application)) {
      throw new Error(`Creating a Renderer without a valid PixiJS instance ${pixi}`)
    }
    this.app = pixi
    document.body.appendChild(this.app.view)
    this.app.stage.interactive = true
    this.app.ticker.add(this.updateFullLineDashes)
  }

  updateFullLineDashes = () => {
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
  updateLines(fullLines) {
    fullLines.forEach(line => {
      let graphics
      let id = line[2]

      if (this.fullLines.has(id)) {
        graphics = this.fullLines.get(id)
      } else {
        graphics = new PIXI.Graphics()
        this.fullLines.set(id, graphics)
        this.app.stage.addChild(graphics);
      }
      this.updateFullLine(line)
      this.renderFullLine(line[2])
    })
  }

  updateFullLine(line) {
    const l = new Line(line)
    const fullLine = l.createFullLine(this.width, this.height, this.diagonal, 50)
    // Creates or updates the line dashes
    this.dashesFor(l.id, fullLine)
  }

  adjusted = new Array(2)
  adjustPoint(point) {
    this.adjusted[0] = point[0] + this.halfWidth
    this.adjusted[1] = this.halfHeight - point[1]
    return this.adjusted
  }

  renderFullLine(lineId) {
    if (!lineId || typeof lineId !== "string") {
      throw new Error(`Cannot render a full line, invalid lineId: ${lineId}`)
    }
    if (!this.fullLinesDashes.has(lineId)) {
      throw new Error(`Cannot render a full line, no dashes set for lineId: ${lineId}`)
    }
    const graphics = this.fullLines.get(lineId)
    if (!graphics || !(graphics instanceof PIXI.Graphics)) {
      throw new Error(`Cannot updated the full line, invalid Graphics instance: ${graphics}`)
    }
    const { points, fullLine } = this.fullLinesDashes.get(lineId)
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

  dashesFor(id, fullLine) {
    // Split the line into dashes
    let dashes
    const dashSize = 12
    const numberOfDashes = Math.round(this.diagonal / dashSize)
    if (this.fullLinesDashes.has(id) && !fullLine) {
      dashes = this.fullLinesDashes.get(id)
      const linePts = dashes.fullLine
      // Update the dashes points 
      Line.split(numberOfDashes, linePts[0], linePts[1], dashes.points, dashes.offset)
    } else {
      const points = Line.split(numberOfDashes, fullLine[0], fullLine[1])
      dashes = { points, offset: 0, fullLine }
      this.fullLinesDashes.set(id, dashes)
    }

    return dashes
  }
}
