/* reports.js — Driver KPI & analytics (Phase 5) */
(() => {
  App.register({ id: 'kpi', title: 'Driver KPI & Analytics', icon: 'chart-column', group: 'Insights', perms: ['kpi.view'], phase: 5,
    render: el => App.placeholder(el, { icon: 'chart-column', phase: 5, title: 'Driver KPI & analytics',
      text: 'Driver leaderboard, all 13 turnaround and rate KPIs, returns performance, filters by date range, entity, driver, store and request type, plus CSV and printable reports. All the timestamps these need are already being recorded.' }) });
})();
