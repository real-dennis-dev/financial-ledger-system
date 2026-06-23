module.exports = {
  routes: require("./routes"),
  controllers: require("./controllers/report.controller"),
  services: require("./services/report.service"),
  middleware: require("./middleware/report.middleware"),
  validations: require("./validations/report.validation"),
  jobs: require("./jobs/report.job"),
  utils: require("./utils/report.util"),
};
