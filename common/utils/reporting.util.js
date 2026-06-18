const fs = require("fs");
const path = require("path");
const { createObjectCsvStringifier } = require("csv-writer");
const PDFDocument = require("pdfkit");
const logger = require("../../config/logger");

class ReportingUtil {
  generateCSV(data, headers) {
    try {
      const csvStringifier = createObjectCsvStringifier({
        header: headers.map((header) => ({
          id: header.key,
          title: header.label,
        })),
      });

      const csvContent =
        csvStringifier.getHeaderString() +
        csvStringifier.stringifyRecords(data);

      return csvContent;
    } catch (error) {
      logger.error("CSV generation error:", error);
      throw new Error("Failed to generate CSV");
    }
  }

  async generatePDF(data, template) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument();
        const chunks = [];

        doc.on("data", (chunk) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);

        // Add title
        doc.fontSize(20).text(template.title || "Report", { align: "center" });
        doc.moveDown();

        // Add metadata
        doc
          .fontSize(10)
          .text(`Generated: ${new Date().toISOString()}`, { align: "right" });
        doc.moveDown();

        // Add content based on template
        if (template.sections) {
          for (const section of template.sections) {
            doc.fontSize(14).text(section.title);
            doc.moveDown();

            if (section.type === "table" && data[section.dataKey]) {
              const tableData = data[section.dataKey];
              if (tableData.length > 0) {
                this.drawTable(doc, tableData, section.columns);
              }
            } else if (section.type === "text" && data[section.dataKey]) {
              doc.fontSize(10).text(data[section.dataKey]);
            } else if (section.type === "summary") {
              this.drawSummary(doc, data[section.dataKey]);
            }

            doc.moveDown();
          }
        }

        doc.end();
      } catch (error) {
        logger.error("PDF generation error:", error);
        reject(new Error("Failed to generate PDF"));
      }
    });
  }

  drawTable(doc, data, columns) {
    const tableTop = doc.y;
    const tableLeft = 50;
    const colWidths = columns.map((col) => col.width || 100);

    // Draw headers
    let x = tableLeft;
    doc.font("Helvetica-Bold").fontSize(10);

    columns.forEach((col, index) => {
      doc.text(col.label, x, tableTop, {
        width: colWidths[index],
        align: "left",
      });
      x += colWidths[index] + 5;
    });

    doc.moveDown();
    doc.font("Helvetica").fontSize(9);

    // Draw data
    let y = doc.y;
    data.forEach((row) => {
      x = tableLeft;
      columns.forEach((col, index) => {
        const value = row[col.key] || "";
        doc.text(value.toString(), x, y, {
          width: colWidths[index],
          align: "left",
        });
        x += colWidths[index] + 5;
      });
      y = doc.y;
      doc.moveDown();
    });

    doc.moveDown();
  }

  drawSummary(doc, data) {
    doc.font("Helvetica-Bold").fontSize(12);
    doc.text("Summary");
    doc.font("Helvetica").fontSize(10);

    for (const [key, value] of Object.entries(data)) {
      doc.text(`${key}: ${value}`);
    }
  }

  formatForExport(data, format) {
    switch (format.toLowerCase()) {
      case "csv":
        return this.generateCSV(data, data.headers || []);
      case "json":
        return JSON.stringify(data, null, 2);
      case "pdf":
        return this.generatePDF(data, data.template || {});
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  async saveReport(data, filename, format) {
    const reportDir = path.join(process.cwd(), "reports");

    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const filePath = path.join(reportDir, filename);
    const content = await this.formatForExport(data, format);

    fs.writeFileSync(filePath, content);
    return filePath;
  }

  generateReportId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `RPT-${timestamp}-${random}`;
  }

  validateReportFilters(filters) {
    const errors = [];

    if (filters.startDate && filters.endDate) {
      const start = new Date(filters.startDate);
      const end = new Date(filters.endDate);

      if (start > end) {
        errors.push("Start date must be before end date");
      }

      const diffDays = (end - start) / (1000 * 60 * 60 * 24);
      if (diffDays > 365) {
        errors.push("Date range cannot exceed 365 days");
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  generateDashboardMetrics(data) {
    return {
      summary: {
        totalAccounts: data.accounts || 0,
        totalTransactions: data.transactions || 0,
        totalVolume: data.volume || 0,
        activeUsers: data.activeUsers || 0,
      },
      trends: data.trends || {},
      charts: data.charts || {},
    };
  }
}

module.exports = new ReportingUtil();
