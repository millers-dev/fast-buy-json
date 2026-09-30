/**
 * Shared commerce rules for the FastBuyJSON reference servers (1.0.0).
 */

import {
  getRegisteredPromos,
  getRegisteredShippingOptions,
  getRegisteredTaxRules,
} from "./extensions.js";

export const DEFAULT_CURRENCY = "USD";

export const TAX_RULES = [
  { country: "default", rate: 0.1, label: "default", jurisdiction: "default" },
  { country: "DE", rate: 0.19, label: "VAT", jurisdiction: "DE" },
  { country: "GB", rate: 0.2, label: "VAT", jurisdiction: "GB" },
];

export const PROMO_CATALOG = {
  SAVE10: {
    code: "SAVE10",
    type: "percentage",
    value: 10,
    label: "10% off",
  },
  WELCOME5: {
    code: "WELCOME5",
    type: "fixed",
    value: 5,
    label: "$5 off",
  },
};

export const SHIPPING_CATALOG = [
  {
    id: "standard",
    label: "Standard Shipping",
    baseAmount: 10,
    currency: DEFAULT_CURRENCY,
    minDays: 3,
    maxDays: 5,
    freeOver: 100,
    description: "Delivered in 3–5 business days",
  },
  {
    id: "express",
    label: "Express Shipping",
    baseAmount: 25,
    currency: DEFAULT_CURRENCY,
    minDays: 1,
    maxDays: 2,
    description: "Delivered in 1–2 business days",
  },
];

export function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function mergedTaxRules() {
  return [...TAX_RULES, ...getRegisteredTaxRules()];
}

function mergedShippingCatalog() {
  return [...SHIPPING_CATALOG, ...getRegisteredShippingOptions()];
}

function mergedPromoCatalog() {
  return { ...PROMO_CATALOG, ...getRegisteredPromos() };
}

export function getTaxRule(countryCode) {
  const normalized = countryCode ? String(countryCode).toUpperCase() : "default";
  const rules = mergedTaxRules();
  const match = rules.find((rule) => rule.country === normalized);
  return match || rules.find((rule) => rule.country === "default");
}

export function findShippingOption(optionId) {
  if (!optionId) {
    return undefined;
  }
  return mergedShippingCatalog().find((option) => option.id === optionId);
}

export function resolveShippingOption(optionId) {
  const id = optionId || "standard";
  return mergedShippingCatalog().find((option) => option.id === id) || SHIPPING_CATALOG[0];
}

export function shippingAmountForOption(option, taxableBase) {
  if (option.freeOver !== undefined && taxableBase > option.freeOver) {
    return 0;
  }
  return option.baseAmount;
}

export function buildShippingOptionViews(taxableBase) {
  return mergedShippingCatalog().map((option) => ({
    id: option.id,
    label: option.label,
    amount: {
      amount: round2(shippingAmountForOption(option, taxableBase)),
      currency: option.currency,
    },
    estimatedDelivery: {
      minDays: option.minDays,
      maxDays: option.maxDays,
    },
    ...(option.freeOver !== undefined
      ? {
          freeOver: { amount: option.freeOver, currency: option.currency },
        }
      : {}),
    ...(option.description ? { description: option.description } : {}),
  }));
}

export function normalizePromoCode(code) {
  if (code === null || code === undefined || code === "") {
    return null;
  }
  return String(code).trim().toUpperCase();
}

export function lookupPromo(code) {
  const normalized = normalizePromoCode(code);
  if (!normalized) {
    return null;
  }
  return mergedPromoCatalog()[normalized] || null;
}

export function computeDiscountAmount(promo, subtotal) {
  if (!promo || subtotal <= 0) {
    return 0;
  }
  let raw = 0;
  if (promo.type === "percentage") {
    raw = subtotal * (promo.value / 100);
  } else {
    raw = promo.value;
  }
  return Math.min(round2(raw), round2(subtotal));
}

export function ensureCartCommerceState(cart) {
  if (!cart.shipping) {
    cart.shipping = {
      selectedOptionId: "standard",
    };
  }
  if (!cart.shipping.selectedOptionId) {
    cart.shipping.selectedOptionId = "standard";
  }
  if (!Array.isArray(cart.appliedDiscounts)) {
    cart.appliedDiscounts = [];
  }
  if (cart.appliedPromoCode === undefined) {
    cart.appliedPromoCode = null;
  }
}

export function applyProductFilters(products, filters) {
  if (!filters || typeof filters !== "object") {
    return products;
  }

  let results = [...products];

  if (filters.brand) {
    const brand = String(filters.brand).toLowerCase();
    results = results.filter(
      (product) => product.brand && product.brand.toLowerCase() === brand
    );
  }

  if (Array.isArray(filters.categories) && filters.categories.length > 0) {
    const wanted = filters.categories.map((c) => String(c).toLowerCase());
    results = results.filter((product) => {
      const categories = (product.categories || []).map((c) =>
        String(c).toLowerCase()
      );
      return wanted.some((category) => categories.includes(category));
    });
  }

  if (filters.priceRange && typeof filters.priceRange === "object") {
    const { min, max } = filters.priceRange;
    results = results.filter((product) => {
      const amount = product.price?.amount;
      if (typeof amount !== "number") {
        return false;
      }
      if (min !== undefined && amount < min) {
        return false;
      }
      if (max !== undefined && amount > max) {
        return false;
      }
      return true;
    });
  }

  if (Array.isArray(filters.availability) && filters.availability.length > 0) {
    const allowed = new Set(filters.availability.map((s) => String(s)));
    results = results.filter((product) =>
      allowed.has(product.availability?.status)
    );
  }

  return results;
}

/**
 * @param {object} cart
 * @param {{ taxCountry?: string }} [options]
 */
export function recomputeCartTotals(cart, options = {}) {
  ensureCartCommerceState(cart);

  for (const item of cart.items) {
    item.lineTotal = {
      amount: round2(item.price.amount * item.quantity),
      currency: item.price.currency,
    };
  }

  cart.updated = new Date().toISOString();

  const subtotal = round2(
    cart.items.reduce((sum, item) => sum + item.lineTotal.amount, 0)
  );

  const taxRule = getTaxRule(options.taxCountry);

  if (cart.items.length === 0) {
    cart.appliedDiscounts = [];
    cart.shipping = {
      selectedOptionId: cart.shipping.selectedOptionId || "standard",
      amount: { amount: 0, currency: DEFAULT_CURRENCY },
      options: buildShippingOptionViews(0),
    };
    cart.totals = {
      currency: DEFAULT_CURRENCY,
      subtotal: 0,
      discount: 0,
      taxableBase: 0,
      tax: 0,
      taxBreakdown: {
        rate: taxRule.rate,
        taxableAmount: 0,
        amount: 0,
        label: taxRule.label,
        jurisdiction: taxRule.jurisdiction,
      },
      shipping: 0,
      discountBreakdown: [],
      total: 0,
    };
    return;
  }

  const promo = lookupPromo(cart.appliedPromoCode);
  const discount = computeDiscountAmount(promo, subtotal);
  const taxableBase = round2(subtotal - discount);

  const tax = round2(taxableBase * taxRule.rate);

  const selectedOption = resolveShippingOption(cart.shipping.selectedOptionId);
  const shippingNumeric = round2(
    shippingAmountForOption(selectedOption, taxableBase)
  );

  const shippingOptions = buildShippingOptionViews(taxableBase);
  cart.shipping = {
    selectedOptionId: selectedOption.id,
    amount: { amount: shippingNumeric, currency: DEFAULT_CURRENCY },
    options: shippingOptions,
  };

  cart.appliedDiscounts = promo
    ? [
        {
          code: promo.code,
          type: promo.type,
          label: promo.label,
          amount: { amount: discount, currency: DEFAULT_CURRENCY },
        },
      ]
    : [];

  cart.totals = {
    currency: DEFAULT_CURRENCY,
    subtotal,
    discount,
    taxableBase,
    tax,
    taxBreakdown: {
      rate: taxRule.rate,
      taxableAmount: taxableBase,
      amount: tax,
      label: taxRule.label,
      jurisdiction: taxRule.jurisdiction,
    },
    shipping: shippingNumeric,
    discountBreakdown: promo
      ? [
          {
            code: promo.code,
            type: promo.type,
            label: promo.label,
            amount: discount,
          },
        ]
      : [],
    total: round2(subtotal - discount + tax + shippingNumeric),
  };
}

export function buildDetectCapabilities() {
  const shippingCatalog = mergedShippingCatalog();
  const promoCatalog = mergedPromoCatalog();
  return {
    filters: {
      fields: ["brand", "categories", "priceRange", "availability", "extensions"],
      additionalProperties: true,
    },
    extensions: {
      supported: true,
      echo: true,
      reservedNamespaces: ["fastbuyjson", "x-fastbuyjson"],
      vendorKeyConvention: "reverse-dns or x- prefix",
    },
    shipping: {
      options: shippingCatalog.map((option) => option.id),
      freeShippingThreshold: {
        amount: 100,
        currency: DEFAULT_CURRENCY,
        appliesWhen: "taxableBase > 100",
        optionId: "standard",
      },
    },
    tax: {
      mode: "jurisdiction",
      defaultRate: 0.1,
      seededCountries: ["DE", "GB"],
      taxableBase: "subtotal minus discount (shipping excluded)",
    },
    discounts: {
      types: ["percentage", "fixed"],
      stackable: false,
      promoCodes: Object.keys(promoCatalog),
    },
  };
}
