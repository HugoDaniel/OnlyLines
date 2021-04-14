class Assert {
  static isNonEmptyArray(value, errorMsg = "Invalid array") {
    if (!Array.isArray(value) || value.length === 0) {
      console.trace()
      throw new Error(`${errorMsg}, expected a non empty array and got ${JSON.stringify(value)} instead`)
    }
  }
  static isNumber(value, errorMsg = "Invalid number") {
    if (value === undefined || value === null || typeof value !== "number" || isNaN(value)) {
      console.trace()
      throw new Error(`${errorMsg}, expected a number and got ${value} instead`)
    }
  }
  static isIdentifiable(value, errorMsg) {
    if (value === undefined || value === null || typeof value !== "object" || !Assert.isStringId(value.id)) {
      console.trace()
      throw new Error(`${errorMsg}, expected an identifiable object and got ${JSON.stringify(value)} instead`)
    }
  }
  static isInstanceOf(value, instance, errorMsg) {
    if (!(value instanceof instance)) {
      console.trace()
      throw new Error(`${errorMsg}, expected an instance of ${instance.name} and got ${JSON.stringify(value)} instead`)
    }
  }


  static isPositiveNumber(value, errorMsg) {
    this.isNumber(value, errorMsg)
    if (value < 0) {
      throw new Error(`${errorMsg}, expected a positive number and got ${value} instead`)
    }
  }

  static isLineData(l, msg = "Line data error") {
    if (!Array.isArray(l) || l.length < 2 || !Array.isArray(l[1]) || !Array.isArray(l[2])) {
      throw new Error(`${msg}, expected an array argument and got ${l} instead`)
    }
    // l is [[x1, y1], [x2, y2]]
    if (
      l[1][0] === undefined || l[1][0] === null || typeof l[1][0] !== "number"
     || l[2][0] === undefined || l[2][0] === null || typeof l[2][0] !== "number"
     || l[1][1] === undefined || l[1][1] === null || typeof l[1][1] !== "number"
     || l[2][1] === undefined || l[2][1] === null || typeof l[2][1] !== "number") {
      throw new Error(`${msg}, expected an array of \
[[x1,y1],[x2,y2]], but instead got ${JSON.stringify(l)}`)
    }
  }

  static isStringId(value, msg = "Invalid id") {
    if (typeof value !== "string" && value.length < 5) {
      throw new Error(`${msg}, expected a string id but instead got ${JSON.stringify(value)}`)
    }
  }
}

export default Assert
