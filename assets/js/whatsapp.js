/* whatsapp.js — WhatsApp notification settings, templates, history and retries (Phase 4) */
(() => {
  App.register({ id: 'whatsapp', title: 'WhatsApp Notifications', icon: 'message-circle', group: 'Insights', perms: ['wa.view', 'wa.manage'], phase: 4,
    render: el => App.placeholder(el, { icon: 'message-circle', phase: 4, title: 'WhatsApp notifications',
      text: 'Connects the WhatsApp Business Cloud API: driver, store, destination and customer-return messages, a non-blocking queue with retries, delivery and read receipts via webhook, test messages and full notification history.' }) });
})();
