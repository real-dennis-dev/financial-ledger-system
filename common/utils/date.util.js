const moment = require("moment");

class DateUtil {
  toUTC(date) {
    return moment(date).utc().toDate();
  }

  formatDate(date, format = "YYYY-MM-DD HH:mm:ss") {
    return moment(date).format(format);
  }

  getBusinessDays(start, end) {
    let count = 0;
    const current = moment(start);
    const endDate = moment(end);

    while (current <= endDate) {
      const dayOfWeek = current.day();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count++;
      }
      current.add(1, "day");
    }

    return count;
  }

  isBusinessDay(date) {
    const dayOfWeek = moment(date).day();
    return dayOfWeek !== 0 && dayOfWeek !== 6;
  }

  addBusinessDays(date, days) {
    let current = moment(date);
    let added = 0;

    while (added < days) {
      current.add(1, "day");
      if (this.isBusinessDay(current)) {
        added++;
      }
    }

    return current.toDate();
  }

  getDateRange(startDate, endDate) {
    const start = moment(startDate);
    const end = moment(endDate);
    const range = [];

    while (start <= end) {
      range.push(start.toDate());
      start.add(1, "day");
    }

    return range;
  }

  getQuarter(date) {
    const month = moment(date).month();
    return Math.floor(month / 3) + 1;
  }

  getFiscalYear(date) {
    const year = moment(date).year();
    const month = moment(date).month();

    // Fiscal year starts in April (month 3)
    if (month >= 3) {
      return `${year}-${year + 1}`;
    } else {
      return `${year - 1}-${year}`;
    }
  }

  getAge(date) {
    return moment().diff(moment(date), "years");
  }

  isDateInRange(date, start, end) {
    const checkDate = moment(date);
    return checkDate.isBetween(moment(start), moment(end), null, "[]");
  }

  getTimeDifference(date1, date2, unit = "milliseconds") {
    const d1 = moment(date1);
    const d2 = moment(date2);
    return d2.diff(d1, unit);
  }
}

module.exports = new DateUtil();
