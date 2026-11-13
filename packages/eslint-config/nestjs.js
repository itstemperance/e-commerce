const base = require('./base');

/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...base,
  env: {
    node: true,
    jest: true,
  },
};
