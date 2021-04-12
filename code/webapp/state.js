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

  constructor() {
    window.location.hash = this.actorId
    this.docId = cuid()
    this.createDoc(this.docId)
    /*
    console.log(this.perge, Verb, window.docSet, this.peer)

    const l1 = new Verb.geom.Line([0, 0, 0], [10, 10, 0])
    const l2 = new Verb.geom.Line([0, 10, 0], [10, 0, 0])
    console.log(l1, l2)
    // const result = Verb.eval.Intersect.curves(l1._data, l2._data, 0.01)
    const result = Verb.eval.Intersect.curves(l1._data, l2._data, 0.01)
    console.log(result);
    */
  }

  /** Creates a new document in the docSet */
  createDoc(id = "default") {
    return this.perge.select(id)(Automerge.change, d => {
      d.fullLines = []
      d.pathLines = []
      d.points = []
    })
  }

  addFullLine(line) {
    if (!line || !(line instanceof Line)) {
      throw new Error(`Cannot add a new full line, the 'line' argument is \
        not a valid Line instance: ${line}`)
    }
    if (!this.docId) {
      throw new Error(`Cannot add a full line, no 'docId' is set: \
        ${this.docId}`)
    }
    this.perge.select(this.docId)(Automerge.change, d => {
      console.log('ADDING LINE', line, line.id)
      d.fullLines.push(line.data)
    })
  }

  updateFullLine(line) {
    if (!line || !(line instanceof Line)) {
      throw new Error(`Cannot update the full line, the 'line' argument is \
        not a valid Line instance: ${line}`)
    }
    if (!this.docId) {
      throw new Error(`Cannot update the full line, no 'docId' is set: \
        ${this.docId}`)
    }
    this.perge.select(this.docId)(Automerge.change, d => {
      const lineIndex = d.fullLines.findIndex(
        (fullLine) => fullLine[2] === line.id)
        // ^ fullLine is an array like [start, end, id]

      if (lineIndex === -1) {
        console.warn('Cannot update line: not found. Was it added to the state?')
        return;
      }

      d.fullLines[lineIndex] = line.data
    })
  }

  /**
   * Subscribe to changes on the current document.
   * Returns a function that cancels/stops the subscription when called.
   */
  onChange(f) {
    return this.perge.subscribe(this.docId, f)
  }
}

class Line {
  fullLine = new Array(2)
  constructor(l) {
    Assert.isLineData(l, "Unable to construct a new Line")
    this.data = l
    // l[2] is the line id
    // this class has getters for all the data points (x,y,id etc...)
    if (!l[2]) {
      // Create the id if it is not set
      l.push(cuid())
    }

    this.fullLine[0] = new Array(2)
    this.fullLine[1] = new Array(2)
  }


  /**
   * Creates a full line for the square given by the w (width)
   * and h (height) dimensions. 
   */
  createFullLine(w, h, len) {
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

    this.fullLine[0][0] = originX
    this.fullLine[0][1] = originY
    this.fullLine[1][0] = finalX
    this.fullLine[1][1] = finalY

    return this.fullLine
  }

  get start() {
    return this.data[0]
  }
  get end() {
    return this.data[1]
  }

  get x1() {
    return this.data[0][0]
  }
  set x1(value) {
    Assert.isNumber(value, `Cannot set line.x1 with ${value}.\
      It must be a number.`)
    this.data[0][0] = value
  }
  get x2() {
    return this.data[1][0]
  }
  set x2(value) {
    Assert.isNumber(value, `Cannot set line.x2 with ${value}.\
      It must be a number.`)
    this.data[1][0] = value
  }
  get y1() {
    return this.data[0][1]
  }
  set y1(value) {
    Assert.isNumber(value, `Cannot set line.y1 with ${value}.\
      It must be a number.`)
    this.data[0][1] = value
  }
  get y2() {
    return this.data[1][1]
  }
  set y2(value) {
    Assert.isNumber(value, `Cannot set line.y2 with ${value}.\
      It must be a number.`)
    this.data[1][1] = value

  }
  get id() {
    return this.data[2]
  }
  set id(value) {
    Assert.isStringId(value, "Cannot set id for line")
    this.data[2] = value
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

    // Initialize the result array
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

  distanceToPoint(pt) {
    if (!Array.isArray(pt) || pt.length < 2 || typeof pt[0] !== "number" || typeof pt[1] !== "number") {
      throw new Error(`Cannot find distance to point, expected an array argument and got ${pt} instead`)
    }

    const x0 = pt[0]
    const y0 = pt[1]
    const x1 = this.x1
    const y1 = this.y1
    const x2 = this.x2
    const y2 = this.y2

    return (Math.abs((x2 - x1)*(y1 - y0) - (x1 - x0)*(y2 - y1)) /
            Math.hypot(x2 - x1, y2 - y1))
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

  isEqual(data) {
    Assert.isLineData(data, "Cannot compare this line")
    return (
      this.x1 === data[0][0] && this.x2 === data[1][0]
      && this.y1 === data[0][1] && this.y2 === data[1][1])
  }

  updateFrom(data) {
    Assert.isLineData(data, "Cannot update line")
    this.x1 = data[0][0];
    this.x2 = data[1][0];
    this.y1 = data[0][1];
    this.y2 = data[1][1];
  }

}

export { State, Line }
