const fs = require('node:fs')

window.services = {
  readText: async (file) => {
    return await fs.promises.readFile(file, { encoding: 'utf-8' })
  }
}
