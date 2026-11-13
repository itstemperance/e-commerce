const base = require('./base');

/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...base,
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
};
