import { evaluateCoralDivinityAdvisor, evaluateCoralDivinityBanking } from '../stats/coral-divinity-advisor.js?v=spiral-bank-7';
import { planSingularityStrategies, compareSingularityPurchases } from '../stats/systems/w5/coral-divinity-spending.js?v=spiral-bank-7';

self.onmessage = ({ data }) => {
  if (!['evaluate', 'cycle', 'bank'].includes(data.type)) return;
  try {
    const result = data.type === 'cycle' ? planSingularityStrategies(data.input, data.rates)
      : data.type === 'bank' ? evaluateCoralDivinityBanking(data.rawSave, data.options) : evaluateCoralDivinityAdvisor(data.rawSave);
    if (data.type === 'cycle' && result.best && data.upgrades)
      result.purchases = compareSingularityPurchases(data.input, result, data.upgrades);
    self.postMessage({ type: 'done', id: data.id, result });
  } catch (error) {
    self.postMessage({ type: 'error', id: data.id, error: error.message || String(error) });
  }
};
