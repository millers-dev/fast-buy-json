/**
 * Reference extension hook registry (empty by default).
 * Integrators register extra shipping, promos, or tax rules without editing core catalogs.
 */

const registry = {
  shippingOptions: [],
  promos: {},
  taxRules: [],
};

export function registerShippingOption(option) {
  registry.shippingOptions.push(option);
}

export function registerPromo(code, promo) {
  const normalized = String(code).trim().toUpperCase();
  registry.promos[normalized] = promo;
}

export function registerTaxRule(rule) {
  registry.taxRules.push(rule);
}

export function getRegisteredShippingOptions() {
  return registry.shippingOptions;
}

export function getRegisteredPromos() {
  return registry.promos;
}

export function getRegisteredTaxRules() {
  return registry.taxRules;
}
