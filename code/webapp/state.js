import Perge from "perge"
import Automerge from "automerge"
import cuid from "cuid"
import Verb from "./external/verb.min.js"
import Assert from "./asserts.js"

class State {
  actorId = cuid()
  peer = window.peer = new Peer(this.actorId)
  docSet = window.docSet = new Automerge.DocSet()
  perge = window.instance = new Perge(this.actorId, {
    decode: JSON.parse,
    encode: JSON.stringify,
    peer: this.peer,
    docSet: this.docSet
  })
  docId = undefined

  constructor(w, h) {
    this.view = new ViewState(w, h)
    this.docId = cuid()
    this.createDoc(this.docId)
    this.perge.subscribe(this.docId, this.view.update)

  }

  /** Creates a new document in the docSet */
  createDoc(id = "default") {
    return this.perge.select(id)(Automerge.change, doc => {
      // Lines are always infinite
      doc.lines = []
      // Each element in the canvas has a relation to all other elements
      doc.relations = []
      // Some points can imply more than one relationship, these
      // are called "merged points" and are recalculated at the
      // end of the interaction
      doc.mergedPoints = []
    })
  }

  addLine(x, y) {
    if (!this.docId) {
      throw new Error(`Cannot add a full line, no 'docId' is set: \
        ${this.docId}`)
    }
    const lineId = cuid()
    const line = [lineId, [x, y], [0, 0]]
    this.perge.select(this.docId)(Automerge.change, doc => {
      // Create the relations with all other items
      for(let i = 0; i < doc.lines.length; i++) {
        doc.relations.push([cuid(), [lineId, Line.id(doc.lines[i])]])
      }
      // After the relations are created, the line is pushed, this
      // is important to happen after the relations are created to
      // avoid creating a relationship with itself
      doc.lines.push(line)
    })
    // Copy the line and return it
    const result = line.slice(0)
    result[1] = line[1].slice(0)
    result[2] = line[2].slice(0)
    return result
  }

  updateLine(line) {
    if (!line || !(line instanceof Line)) {
      throw new Error(`Cannot update the full line, the 'line' argument is not a valid Line instance: ${line}`)
    }
    if (!this.docId) {
      throw new Error(`Cannot update the full line, no 'docId' is set: ${this.docId}`)
    }
    this.perge.select(this.docId)(Automerge.change, doc => {
      const lineIndex = doc.lines.findIndex(
        (l) => Line.id(l) === line.id)
        // ^ line is an array like [id, start, end]

      if (lineIndex === -1) {
        console.warn('Cannot update line: not found. Was it added to the state?')
        return;
      }

      doc.lines[lineIndex] = line.data
    })
  }
}

/**
 * A relation can have multiple points (a Line related to a Circle can produce
 * up to two points). Each Point keeps track of the corresponding relations
 * that produce it and thus there can be multiple relations per point.
 * Points next to each other are merged, and new "strong" relationships
 * are produced.
 */
class ViewState {
  allThings = new Map()
  updateCallbacks = []
  view = {
    bounds: { w: 0, h: 0, diagonal: 0 },
    points: [],
    lines: [],
  }

  constructor(w, h) {
    this.view.bounds.w = w
    this.view.bounds.h = h
    this.view.bounds.diagonal = Math.hypot(w, h)
  }

  update = (doc) => {
    // Update full lines
    doc.lines.forEach(line => {
      if (this.allThings.has(Line.id(line))) {
        this.allThings.get(Line.id(line)).updateFrom(line)
      } else {
        this.allThings.set(Line.id(line), new Line(line))
      }
    })

    // Update relations, must be done at the end
    doc.relations.forEach(r => {
      if (this.allThings.has(Relation.id(r))) {
        this.allThings.get(Relation.id(r)).updateFrom(Relation.relatedIds(r))
      } else {
        // Get all the elements in this relation
        // and create a new Relation instance
        this.allThings.set(Relation.id(r), new Relation(r,
          Relation.relatedIds(r).map(elemId =>
            this.allThings.get(elemId))))
      }
    })

    // Finally process the view to send to renderers
    // Lines and Circles
    this.view.lines = []
    for(const thing of this.allThings.values()) {
      if (thing instanceof Line) {
        this.view.lines.push(thing.createFullLine(this.view.bounds))
      }
    }

    // This goes through the relations and finds the points
    // And builds the list of full lines
    this.view.points = []
    doc.relations.forEach(r => {
      const relation = this.allThings.get(Relation.id(r))
      relation.points().forEach(pt => {
        // Check if the intersection was possible
        if (pt !== undefined) {
          this.view.points.push(Point.create(relation, pt))
        }
      })
    })

    
    // Call the update callbacks with this class
    this.callListeners()
  }

  addRelationPoints(relation) {
    for(let i = 0; i < this.points.length; i++) {
      const pt = this.points[i]
      if (pt.hasRelation(relation)) {
        relation
      }
    }
  }

  callListeners() {
    for(let i = 0; i < this.updateCallbacks.length; i++) {
      this.updateCallbacks[i](this.view)
    }
  }
  /**
   * Subscribe to changes on the current document.
   * Returns a function that cancels/stops the subscription when called.
   */
  onUpdate(f) {
    this.updateCallbacks.push(f)
  }
}

class Point {
  constructor(relation, ptData) {
    Assert.isNonEmptyArray(ptData, 'Cannot create Point')
    Assert.isInstanceOf(relation, Relation, 'Cannot create Point')
    this.data = ptData 
    this.relation = relation
  }

  static create(relation, ptData) {
    Assert.isNonEmptyArray(ptData, 'Cannot create Point object')
    Assert.isInstanceOf(relation, Relation, 'Cannot create Point object')
    return ({
      x: ptData[0],
      y: ptData[1],
      id: relation.id
    })
  }

  hasRelation(relation) {
    return this.relation.id === relation.id
  }

  get x() {
    return this.data[0]
  }
  get y() {
    return this.data[1]
  }

  distanceTo(x, y) {
     return Math.pow(this.x - x, 2) + Math.pow(this.y - y, 2)
  }
}

/** Intersection Point */
class Relation {
  // elements are the build element instances (Line, Circle, etc)
  constructor(data, elements) {
    Relation.assertRelationElements(elements)
    this.data = data

    this.elements = elements
  }

  get id() {
    return Relation.id(this.data)
  }

  get relatedIds() {
    return Relation.relatedIds(this.data)
  }

  updateFrom(data) {
    Assert.isNonEmptyArray(data, 'Cannot update Relation from data')
    for(let i = 0; i < data[1].length; i++) {
      this.data[1][i] = data[1][i]
    }
  }

  static id(data) {
    Assert.isNonEmptyArray(data)
    Assert.isStringId(data[0])
    return data[0]
  }

  static relatedIds(data) {
    Assert.isNonEmptyArray(data)
    Assert.isNonEmptyArray(data[1])
    Assert.isStringId(data[1][0])
    Assert.isStringId(data[1][0])
    return data[1]
  }

  /**
   * Calculates the intersections between the elements
   * and returns the points.
   **/
  points(dest = [new Array(2)]) {
    const elem1 = this.elements[0]
    const elem2 = this.elements[1]
    // Intersect two Line's
    if (elem1 instanceof Line) {
      if (elem2 instanceof Line) {
        dest[0] = elem1.intersectWithLine(elem2, dest[0])
      }
    }
    return dest
  }

  static assertRelationElements(elements) {
    if (!elements.every(this.isValidElement)) {
      throw new Error(`Cannot create relation with invalid elements: ${JSON.stringify(elements)}`)
    }
    if (elements.length < 2) {
      throw new Error(`Cannot create relation, at least 2 elements are needed and got ${elements.length} in ${JSON.stringify(elements)}`)
    }
  }

  static isValidElement(element) {
    return element instanceof Line
  }
}

class Circle {
  center // Relation
  radius = 0

  constructor() {
  }
}

class Line {
  constructor(l) {
    Assert.isLineData(l, "Unable to construct a new Line")
    this.data = l
    // this class has getters for all the data points (x,y,id etc...)
    if (!l[0]) {
      // Create the id if it is not set
      l.push(cuid())
    }
  }

  /**
   * Creates a full line for the square given by the w (width)
   * and h (height) dimensions. 
   */
  createFullLine({ w, h, diagonal }) {
    const len = diagonal
    let originY = this.yFor(- w / 2)
    let originX
    if (originY > (h / 2)) {
      originX = this.xFor(h / 2)
      originY = this.yFor(originX)
    } else if(originY < (-h / 2)) {
      originX = this.xFor(-h / 2)
      originY = this.yFor(originX)
    } else {
      originX = -w / 2
    }
    // this.m is the line slope
    const angle = Math.atan(this.m)
    // The finalXY is the point on the line at a distance of "len" 
    // from the originXY
    const finalX = originX + len * Math.cos(angle)
    const finalY = originY + len * Math.sin(angle)

    const fullLine = {
      start: [originX, originY],
      end: [finalX, finalY],
      id: this.id
    }

    return fullLine
  }

  get start() {
    return this.data[1]
  }
  get end() {
    return this.data[2]
  }

  get x1() {
    return this.data[1][0]
  }
  set x1(value) {
    Assert.isNumber(value, `Cannot set line.x1 with ${value}.\
      It must be a number.`)
    this.data[1][0] = value
  }
  get x2() {
    return this.data[2][0]
  }
  set x2(value) {
    Assert.isNumber(value, `Cannot set line.x2 with ${value}.\
      It must be a number.`)
    this.data[2][0] = value
  }
  get y1() {
    return this.data[1][1]
  }
  set y1(value) {
    Assert.isNumber(value, `Cannot set line.y1 with ${value}.\
      It must be a number.`)
    this.data[1][1] = value
  }
  get y2() {
    return this.data[2][1]
  }
  set y2(value) {
    Assert.isNumber(value, `Cannot set line.y2 with ${value}.\
      It must be a number.`)
    this.data[2][1] = value

  }
  get id() {
    return this.data[0]
  }
  set id(value) {
    Assert.isStringId(value, "Cannot set id for line")
    this.data[0] = value
  }

  get m() {
    return (this.y2 - this.y1) / ((this.x2 - this.x1) === 0 ?
      0.001 : (this.x2 - this.x1))
  }

  get b() {
    return this.y1 - this.m * this.x1
  }

  /** The value of X for y=0 */
  get zero() {
    return -this.b / this.m
  }

  yFor = (x) => {
    if (x === undefined || x === null || typeof x !== "number") {
      throw new Error(`yFor(x) needs x to be a number, and instead got: ${x}.`)
    }
    return this.m * x + this.b
  }

  xFor = (y) => {
    if (y === undefined || y === null || typeof y !== "number") {
      throw new Error(`xFor(y) needs y to be a number, and instead got: ${y}.`)
    }
    return (y - this.b) / this.m
  }

  static split = (pts, [startX, startY], [endX, endY], dest, offset = 0) => {
    Assert.isPositiveNumber(pts, "Unable to split line 'pts' arg is invalid")
    Assert.isPositiveNumber(offset, "Unable to split line 'offset' arg is invalid")
    Assert.isNumber(startX, "Unable to split line 'startX' arg is invalid")
    Assert.isNumber(startY, "Unable to split line 'startY' arg is invalid")
    Assert.isNumber(endX, "Unable to split line 'endX' arg is invalid")
    Assert.isNumber(endY, "Unable to split line 'endY' arg is invalid")

    // Initialize and allocate the result array
    let result = dest
    if (!result) {
      result = new Array(pts)
      for(let i = 0; i < pts; i++) {
        result[i] = new Array(2)
      }
    } 
    // Splitting is done by parameterizing the line from 0.0 to 1.0 in a var
    // 't' that is increased a fraction at each point:
    // dX and dY store the amount of line distance for each t 
    const dX = endX - startX
    const dY = endY - startY
    // Offset can be animated, the maxOffset is the amount at which the offset
    // starts repeating
    const maxOffset = (2 / pts) 
    // Run through the necessary number of points and traverse the line by
    // calculating the parameterized 't' and its corresponding position
    for(let i = 0; i < pts; i++) {
      // 't' is the value between 0.0 and 1.0 for the given point, plus offset
      let t = i / (pts - 1) + (offset * maxOffset % maxOffset)
      result[i][0] = startX + t*dX
      result[i][1] = startY + t*dY
    }

    return result
  }

  /**
   * Return the two points for the line edges at the bounding box
   * specified by the w,h size, with (0,0) at the center
   */
  edgesFor(w, h) {
    Assert.isPositiveNumber(w, "Invalid line edge w")
    Assert.isPositiveNumber(h, "Invalid line edge h")

    const limitW = w / 2
    const limitH = h / 2

    let startX, startY, endX, endY

    startX = this.xFor(-limitH)
    startY = -limitH
    if (startX > limitW || startX < -limitW) {
      startY = this.yFor(-limitW)
      startX = -limitW
    } 

    endX = this.xFor(limitH)
    endY = limitH
    if (endX > limitW || endX < -limitW) {
      endY = this.yFor(limitW)
      endX = limitW
    }

    return ([[startX, startY], [endX, endY]])
  }

  distanceToPoint(x0, y0) {
    Assert.isNumber(x0, "Cannot find distance to point")
    Assert.isNumber(y0, "Cannot find distance to point")

    const x1 = this.x1
    const y1 = this.y1
    const x2 = this.x2
    const y2 = this.y2

    return (Math.abs((x2 - x1)*(y1 - y0) - (x1 - x0)*(y2 - y1)) /
            Math.hypot(x2 - x1, y2 - y1))
  }

  get nurbs() {
    return new Verb.geom.Line([this.x1, this.y1, 0], [this.x2, this.y2, 0])
  }

  intersectWithLine(l, dest = new Array(2)) {
    if ( !(l instanceof Line) ) {
      throw new Error(`Cannot intersect line with 'l', expected a Line and got ${JSON.stringify(l)}`)
    }

    if (this.isEqual(l)) {
      // Coincident lines, no intersection is possible
      return undefined
    }
    const x1 = this.x1
    const x2 = this.x2
    const x3 = l.x1
    const x4 = l.x2
    const y1 = this.y1
    const y2 = this.y2
    const y3 = l.y1
    const y4 = l.y2
    const epsilon = 0.001

    const d = (x1 - x2)*(y3 - y4) - (y1 - y2)*(x3 - x4)
    if (d < epsilon && d > -epsilon) {
      // No intersection, lines are parallel
      return undefined
    }
    dest[0] = ((x1*y2 - y1*x2)*(x3 - x4) - (x1 - x2)*(x3*y4 - y3*x4)) / d
    dest[1] = ((x1*y2 - y1*x2)*(y3 - y4) - (y1 - y2)*(x3*y4 - y3*x4)) / d

    return dest
  }

  nearestPointTo(pt) {
    if (!Array.isArray(pt) || pt.length < 2 || typeof pt[0] !== "number" || typeof pt[1] !== "number") {
      throw new Error(`Cannot find distance to point, expected an array argument and got ${pt} instead`)
    }

    // Line General Form
    const a = -this.m
    const b = 1
    const c = -this.b
    const x0 = pt[0]
    const y0 = pt[1]

    return (
      [ 
        (b*(b*x0 - a*y0) - a*c) / (a * a + b * b),
        (a*(-b*x0 + a*y0) - b*c) / (a * a + b * b)
      ])
  }

  isDataEqual(data) {
    Assert.isLineData(data, "Cannot compare this line")
    return (
      this.x1 === data[1][0] && this.x2 === data[2][0]
      && this.y1 === data[1][1] && this.y2 === data[2][1])
  }

  isEqual(l, precision = 1000) {
    if ( !(l instanceof Line) ) {
      throw new Error(`Cannot compare line with 'l', expected a Line and got ${JSON.stringify(l)}`)
    }
    Assert.isPositiveNumber(precision, `Comparing lines must have a positive precision specified, instead got ${precision}`)

    const b1 = Math.floor(this.b * precision) / precision
    const b2 = Math.floor(l.b * precision) / precision
    const m1 = Math.floor(this.m * precision) / precision
    const m2 = Math.floor(l.m * precision) / precision

    return (m1 === m2 && b1 === b2)
  }

  updateFrom(data) {
    Assert.isLineData(data, "Cannot update line")
    this.x1 = data[1][0]
    this.x2 = data[2][0]
    this.y1 = data[1][1]
    this.y2 = data[2][1]
  }

  static id(data) {
    if (!Array.isArray(data) || data.length < 3) {
      throw new Error(`Cannot get id from Line data: ${data}, needs to be an array with at least 3 elements`)
    }
    // [0] is the line id, [1] and [2] are the line points
    return data[0]
  }
}

export { State, Line }
