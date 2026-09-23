import { api } from '../api/client.js';

export function createReportService() {
  async function getOverview(params = {}) {
    try { return await api.getReports(params); } catch { return { today_revenue: 0, today_orders: 0, total_orders: 0, outstanding_balance: 0, ready_orders: 0, overdue_orders: 0, active_laundry: 0 }; }
  }

  async function getSales(dateFrom, dateTo) { return await api.getReports({ date_from: dateFrom, date_to: dateTo }); }
  async function getByDay(days = 7) { return await api.getReportByDay(days); }
  async function getByPeriod(params = {}) { return await api.getReportByPeriod(params); }
  async function getComparison(params = {}) { return await api.getReportComparison(params); }
  async function getLaundry(status) { return await api.getLaundry(status); }
  async function getTopCustomers() { return await api.getTopCustomers(); }
  async function getTopServices() { return await api.getTopServices(); }
  async function getCashierReports() { return await api.getCashierReports(); }
  async function getPaymentReport(params = {}) { return await api.getPaymentReport(params); }
  async function getOutstandingReport(params = {}) { return await api.getOutstandingReport(params); }
  async function getRefundReport(params = {}) { return await api.getRefundReport(params); }
  async function getExpenseReport(params = {}) { return await api.getExpenseReport(params); }
  async function getServicesPerformance(params = {}) { return await api.getServicesPerformance(params); }
  async function getOrderStatusReport(params = {}) { return await api.getOrderStatusReport(params); }
  async function getExpressVsNormal(params = {}) { return await api.getExpressVsNormal(params); }
  async function getFulfilmentReport(params = {}) { return await api.getFulfilmentReport(params); }
  async function getCashReport(params = {}) { return await api.getCashReport(params); }
  async function getCustomerGrowth(params = {}) { return await api.getCustomerGrowth(params); }
  async function getDiscountReport(params = {}) { return await api.getDiscountReport(params); }
  async function getProfitabilityReport(params = {}) { return await api.getProfitabilityReport(params); }
  async function getBranchReport() { return await api.getBranchReport(); }

  return { getOverview, getSales, getByDay, getByPeriod, getComparison, getLaundry, getTopCustomers, getTopServices, getCashierReports, getPaymentReport, getOutstandingReport, getRefundReport, getExpenseReport, getServicesPerformance, getOrderStatusReport, getExpressVsNormal, getFulfilmentReport, getCashReport, getCustomerGrowth, getDiscountReport, getProfitabilityReport, getBranchReport };
}