module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: ["eslint:recommended"],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  ignorePatterns: ["dist/", "node_modules/"],
  rules: {
    "no-unused-vars": ["warn", { args: "none", ignoreRestSiblings: true }],
    "no-console": ["warn", { allow: ["warn", "error", "info", "log"] }],
  },
};
