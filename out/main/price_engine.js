/**
 * Price Engine - SourceFlowX price_engine.py JS port
 * 카테고리별 마진율, .99 반올림, compare_at_price 생성
 */

const CATEGORY_MARGINS = {
  "Electronics": 40,
  "Cell Phones & Accessories": 40,
  "Computers & Accessories": 40,
  "Pet Supplies": 35,
  "Home & Kitchen": 40,
  "Sports & Outdoors": 45,
  "Tools & Home Improvement": 40,
  "Toys & Games": 45,
  "Beauty & Personal Care": 50,
  "Health & Household": 45,
  "Office Products": 40,
  "Automotive": 40,
  "Garden & Outdoor": 40,
  "Baby": 45,
  "Clothing, Shoes & Jewelry": 50,
};

const DEFAULT_MARGIN = 40;
const MIN_PRICE = 9.99;
const COMPARE_AT_MARKUP = 20;

function roundTo99(price) {
  return Math.floor(price) + 0.99;
}

function calculatePrice(product) {
  const amazonPrice = product.price || 0;

  if (!amazonPrice || amazonPrice <= 0) {
    return {
      price: 0,
      compare_at_price: 0,
      cost_per_item: 0,
      margin_percent: 0,
      currency: "USD",
      note: "NO_PRICE",
    };
  }

  // 카테고리별 마진율 결정
  const breadcrumb = product.tags || product.category_breadcrumb || [];
  let margin = DEFAULT_MARGIN;
  if (Array.isArray(breadcrumb) && breadcrumb.length > 0) {
    const topCategory = breadcrumb[0];
    margin = CATEGORY_MARGINS[topCategory] || DEFAULT_MARGIN;
  }

  // 마진 적용
  const rawPrice = amazonPrice * (1 + margin / 100);
  let sellingPrice = roundTo99(rawPrice);
  if (sellingPrice < MIN_PRICE) sellingPrice = MIN_PRICE;

  // compare_at_price
  const compareRaw = sellingPrice * (1 + COMPARE_AT_MARKUP / 100);
  const compareAtPrice = roundTo99(compareRaw);

  return {
    price: sellingPrice,
    compare_at_price: compareAtPrice,
    cost_per_item: amazonPrice,
    margin_percent: margin,
    currency: "USD",
  };
}

module.exports = { calculatePrice, CATEGORY_MARGINS, DEFAULT_MARGIN };
