"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if ((from && typeof from === "object") || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, {
          get: () => from[key],
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable,
        });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (
  (target = mod != null ? __create(__getProtoOf(mod)) : {}),
  __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule
      ? __defProp(target, "default", { value: mod, enumerable: true })
      : target,
    mod,
  )
);
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const electron = require("electron");
const path = require("path");
const utils = require("@electron-toolkit/utils");
const main = require("custom-electron-titlebar/main");
const crawlee = require("crawlee");
const electronUpdater = require("electron-updater");
const Store = require("electron-store");
const log = require("electron-log/main");
const fs = require("fs");
const admZip = require("adm-zip");
const find = require("find-process");
const dayjs = require("dayjs");
const lodash = require("lodash");
const child_process = require("child_process");
const adminApiClient = require("@shopify/admin-api-client");
const fetch$1 = require("node-fetch");
const FormData$1 = require("form-data");
const stream = require("stream");
const promises = require("fs/promises");
const readline = require("readline");
const axios = require("axios");
const http = require("http");
const crypto = require("crypto");
const supabaseJs = require("@supabase/supabase-js");
const { generateAllTags } = require("./tag_engine");
const { calculatePrice } = require("./price_engine");
const icon = path.join(__dirname, "../../resources/icon.png");
var LABEL = /* @__PURE__ */ ((LABEL2) => {
  LABEL2["INIT"] = "INIT";
  LABEL2["AMAZON_PRODUCT_LIST"] = "AMAZON_PRODUCT_LIST";
  LABEL2["AMAZON_PRODUCT_DETAIL"] = "AMAZON_PRODUCT_DETAIL";
  LABEL2["AMAZON_PRODUCT_ASIN"] = "AMAZON_PRODUCT_ASIN";
  return LABEL2;
})(LABEL || {});
const addProductListRouter = (router2) => {
  return router2.addHandler(
    LABEL.AMAZON_PRODUCT_LIST,
    async ({ request, page, enqueueLinks, log: log2 }) => {
      log2.info(`${request.label} : ${request.url}`);
      sendLogToRenderer({
        label: request.label || "",
        url: request.url,
        message: "검색 결과 페이지 작업",
        level: "info",
        timestamp: Date.now(),
      });
      Crawler.checkAborted();
      const productItemLinkSelector =
        '[data-component-type="s-search-result"]:not(.AdHolder) .s-product-image-container a';
      await page.waitForSelector(productItemLinkSelector, {
        timeout: 3e4,
      });
      const products = await page
        .locator('[data-component-type="s-search-result"]:not(.AdHolder)')
        .all();
      let primeProductLinks = [];
      Crawler.checkAborted();
      for (const product of products) {
        if (global.isPrime) {
          if (
            (await product
              .locator('[role="img"][aria-label="Amazon Prime"]')
              .count()) > 0
          ) {
            const link =
              (await product
                .locator(".s-product-image-container a")
                .getAttribute("href")) || "";
            primeProductLinks.push(link);
          }
        } else {
          const link =
            (await product
              .locator(".s-product-image-container a")
              .getAttribute("href")) || "";
          primeProductLinks.push(link);
        }
      }
      log2.info(`primeProductLinks : ${primeProductLinks.length}`);
      let pageInfo = { currentPage: 1 };
      const paginationLoc = page.locator(".s-pagination-selected");
      const hasPagination = (await paginationLoc.count()) > 0;
      if (hasPagination) {
        const currentPageText = await paginationLoc.innerText();
        pageInfo.currentPage = +currentPageText;
      }
      crawlerLog.info(
        `[크롤링] ${pageInfo.currentPage}페이지: ${primeProductLinks.length}개 발견`,
      );
      sendLogToRenderer({
        label: request.label || "",
        url: request.url,
        message: `${pageInfo.currentPage}페이지 상품 수 : ${primeProductLinks.length}`,
        level: "info",
        timestamp: Date.now(),
      });
      await enqueueLinks({
        urls: primeProductLinks,
        label: LABEL.AMAZON_PRODUCT_ASIN,
      });
      const nextButton = page.locator(".s-pagination-next");
      const hasNext = (await nextButton.count()) > 0;
      if (hasNext) {
        crawlerLog.info(
          `[크롤링] ${pageInfo.currentPage}페이지 완료, 다음 페이지로 이동`,
        );
        await enqueueLinks({
          selector: ".s-pagination-next",
          label: LABEL.AMAZON_PRODUCT_LIST,
        });
      } else {
        crawlerLog.info(`[크롤링] ${pageInfo.currentPage}페이지 완료 (마지막)`);
      }
    },
  );
};
const addASINRouter = (router2) => {
  return router2.addHandler(
    LABEL.AMAZON_PRODUCT_ASIN,
    async ({ request, page, enqueueLinks, log: log2 }) => {
      log2.info(`${request.label} : ${request.url}`);
      sendLogToRenderer({
        label: request.label || "",
        url: request.url,
        message: "상품 상세 페이지 분석",
        level: "info",
        timestamp: Date.now(),
      });
      try {
        Crawler.checkAborted();
        const twisterData = await page.evaluate(async () => {
          try {
            const twisterJSInitData2 =
              window.twisterController.twisterJSInitData;
            return twisterJSInitData2;
          } catch (error) {
            return null;
          }
        });
        let asinLinkList;
        if (twisterData) {
          const asinMap = Object.keys(twisterData.dimensionValuesDisplayData);
          asinLinkList = asinMap.map(
            (asin) => `https://www.amazon.com/dp/${asin}?psc=1&trnd=${asin}`,
          );
        } else {
          const asinLoc = page.locator("input#ASIN");
          if ((await asinLoc.count()) == 0) throw new Error("input#ASIN Error");
          const asin = await asinLoc.first().getAttribute("value");
          if (!asin) {
            throw new Error("asin error");
          }
          asinLinkList = [
            `https://www.amazon.com/dp/${asin}?psc=1&trnd=${asin}`,
          ];
        }
        await enqueueLinks({
          urls: asinLinkList,
          label: LABEL.AMAZON_PRODUCT_DETAIL,
          forefront: true,
        });
      } catch (error) {
        log2.error(`err : ${error}`);
      }
    },
  );
};
const addDetailRouter = (router2) => {
  return router2.addHandler(
    LABEL.AMAZON_PRODUCT_DETAIL,
    async ({ request, page, log: log2, pushData }) => {
      log2.info(`${request.label} : ${request.url}`);
      sendLogToRenderer({
        label: request.label || "",
        url: request.url,
        message: "상품 상세 페이지 작업",
        level: "info",
        timestamp: Date.now(),
      });
      try {
        Crawler.checkAborted();
        const buyNowLoc = page.locator("#buyNow");
        const isUnavailableProduct = (await buyNowLoc.count()) === 0;
        if (isUnavailableProduct) {
          let reason = "알 수 없음";
          try {
            const bodyText = await page
              .locator("#availability, #outOfStock, .a-box-inner")
              .allInnerTexts();
            const combinedText = bodyText.join(" ").toLowerCase();
            if (
              combinedText.includes("currently unavailable") ||
              combinedText.includes("currently out of stock")
            ) {
              reason = "품절";
            } else if (
              combinedText.includes("temporarily out of stock") ||
              (combinedText.includes("only") &&
                combinedText.includes("left in stock"))
            ) {
              reason = "일시품절";
            } else if (
              combinedText.includes("cannot be shipped") ||
              combinedText.includes("does not ship to")
            ) {
              reason = "지역제한";
            } else if (
              combinedText.includes("we don't know when") ||
              combinedText.includes("we don't know if")
            ) {
              reason = "판매중단";
            } else if (combinedText.includes("see price in cart")) {
              reason = "가격 미표시";
            } else if (combinedText.includes("not available")) {
              reason = "구매 불가";
            }
          } catch (error) {
            log2.debug(`원인 파악 실패: ${error}`);
          }
          log2.warning(`isUnavailableProduct: ${reason}`);
          crawlerLog.warn(`[크롤링] 구매 불가 (${reason}): ${request.url}`);
          sendLogToRenderer({
            label: request.label || "",
            url: request.url,
            message: `구매 불가 상품 (${reason})`,
            level: "danger",
            timestamp: Date.now(),
          });
          return;
        }
        Crawler.checkAborted();
        const titleLoc = page.locator("span#productTitle");
        const title = await titleLoc.innerText();
        const brandLoc = page.locator("a#bylineInfo");
        const brandLink = await brandLoc.getAttribute("href");
        if (!brandLink) {
          throw new Error("brandLink error");
        }
        const brandRegexPatterns = [
          /\/stores\/(.*)\/page\//,
          /field-lbr_brands_browse-bin=(.*)/,
        ];
        let brand = "";
        for (const regex of brandRegexPatterns) {
          const match = regex.exec(brandLink);
          if (!match || !match[1]) continue;
          brand = match[1];
        }
        const priceLoc = page
          .locator("#desktop_qualifiedBuyBox #twister-plus-price-data-price")
          .first();
        const price = await priceLoc.getAttribute("value");
        if (!price) {
          throw new Error("price error");
        }
        const quantityLoc = page.locator("[name=quantity] :last-child").first();
        const onlyOnlyLeft = (await quantityLoc.count()) === 0;
        let quantity = 0;
        if (onlyOnlyLeft) {
          quantity = 1;
        } else {
          let tempQuantity = await quantityLoc.getAttribute("value");
          if (!tempQuantity) throw new Error("quantity error");
          quantity = tempQuantity;
        }
        const breadcrumbLoc = page.locator(
          "#wayfinding-breadcrumbs_feature_div li a",
        );
        const tags = await breadcrumbLoc.allInnerTexts();
        const category = tags[tags.length - 1];
        Crawler.checkAborted();
        const haveProductFactsDesktopLoc =
          (await page.locator("#productFactsDesktop_feature_div").count()) > 0;
        const haveNutritionAboutThisLoc =
          (await page.locator("#nic-po-expander-section-desktop").count()) > 0;
        let overviewLoc, factsLoc, AboutThisItemLoc;
        if (haveProductFactsDesktopLoc) {
          factsLoc = page.locator(
            "#productFactsDesktop_feature_div .a-fixed-left-grid-inner",
          );
          AboutThisItemLoc = page.locator(
            "#productFactsDesktop_feature_div li span.a-list-item",
          );
        } else if (haveNutritionAboutThisLoc) {
          overviewLoc = page.locator(
            "#nic-po-expander-section-desktop table tr",
          );
          AboutThisItemLoc = page.locator(
            "#nic-po-expander-section-desktop li span.a-list-item",
          );
        } else {
          overviewLoc = page.locator("#productOverview_feature_div table tr");
          AboutThisItemLoc = page.locator(
            "#featurebullets_feature_div span.a-list-item",
          );
        }
        let overview = [],
          aboutThis = [];
        if (factsLoc) {
          for (const item of await factsLoc.all()) {
            let overviewRaws = [];
            for (const childDiv of await item.locator("> div").all()) {
              const itemText = (await childDiv.innerText()).trim();
              overviewRaws.push(itemText);
            }
            overview.push(overviewRaws.join(" : "));
          }
        }
        if (overviewLoc) {
          for (const item of await overviewLoc.all()) {
            let overviewRaws = [];
            for (const childDiv of await item.locator("> td").all()) {
              const itemText = (await childDiv.innerText()).trim();
              overviewRaws.push(itemText);
            }
            overview.push(overviewRaws.join(" : "));
          }
        }
        for (const item of await AboutThisItemLoc.all()) {
          const itemText = (await item.innerText()).trim();
          aboutThis.push(itemText);
        }
        Crawler.checkAborted();
        const twisterData = await page.evaluate(async () => {
          try {
            const twisterJSInitData2 =
              window.twisterController.twisterJSInitData;
            return twisterJSInitData2;
          } catch (error) {
            return null;
          }
        });
        let options = {};
        if (twisterData) {
          options.selectedVariations = twisterData.selected_variations;
          options.variationDisplayLabels = twisterData.variationDisplayLabels;
        }
        const asinLoc = page.locator("input#ASIN");
        if ((await asinLoc.count()) == 0) throw new Error("input#ASIN Error");
        const asin = await asinLoc.first().getAttribute("value");
        if (!asin) {
          throw new Error("asin error");
        }
        Crawler.checkAborted();
        const imageBlockATFData = await page.evaluate(() => {
          const scripts = document.querySelectorAll(
            "#imageBlock_feature_div script",
          );
          for (const script of scripts) {
            const text = script.textContent || "";
            if (!text.includes("colorImages")) continue;
            const match = text.match(/["']?colorImages["']?\s*:\s*\{/);
            if (!match || match.index === void 0) continue;
            const braceStart = text.indexOf(
              "{",
              match.index + match[0].length - 1,
            );
            let braceCount = 0;
            let endIdx = braceStart;
            for (let i = braceStart; i < text.length; i++) {
              if (text[i] === "{") braceCount++;
              if (text[i] === "}") braceCount--;
              if (braceCount === 0) {
                endIdx = i + 1;
                break;
              }
            }
            const colorImagesStr = text.substring(braceStart, endIdx);
            try {
              const colorImages = new Function("return " + colorImagesStr)();
              return { colorImages };
            } catch {}
          }
          const thumbImgs = document.querySelectorAll("#altImages img");
          if (thumbImgs.length > 0) {
            const images = Array.from(thumbImgs)
              .map((img) => {
                const src = img.getAttribute("src") || "";
                const hiRes = src.replace(/\._[^.]+_\./, "._AC_SL1500_.");
                const large = src.replace(/\._[^.]+_\./, "._AC_SL500_.");
                return {
                  hiRes,
                  thumb: src,
                  large,
                  main: { [hiRes]: [1500, 1500] },
                  variant: "MAIN",
                  lowRes: null,
                  shoppableScene: null,
                };
              })
              .filter(
                (img) =>
                  img.thumb &&
                  !img.thumb.includes("play-button") &&
                  !img.thumb.includes("360"),
              );
            if (images.length > 0) {
              return { colorImages: { initial: images } };
            }
          }
          return null;
        });
        // ========== 추가 수집 항목 (SourceFlowX 호환) ==========
        const extraData = await page.evaluate(() => {
          const result = {};
          const html = document.documentElement.outerHTML;

          // parent_asin
          const parentAsinInput = document.querySelector('input[name="parentAsin"]');
          result.parent_asin = parentAsinInput ? parentAsinInput.value.trim() : "";

          // date_first_available
          result.date_first_available = "";
          document.querySelectorAll("table tr").forEach((row) => {
            const th = row.querySelector("th");
            const td = row.querySelector("td");
            if (th && td && th.textContent.trim().toLowerCase().includes("date first available")) {
              result.date_first_available = td.textContent.trim();
            }
          });
          if (!result.date_first_available) {
            const bullets = document.querySelector("#detailBullets_feature_div");
            if (bullets) {
              bullets.querySelectorAll("li").forEach((li) => {
                if (li.textContent.toLowerCase().includes("date first available")) {
                  const parts = li.textContent.split(":");
                  if (parts.length >= 2) result.date_first_available = parts.slice(1).join(":").trim();
                }
              });
            }
          }

          // currency
          result.currency = "";
          const priceEl = document.querySelector("#corePriceDisplay_desktop_feature_div .a-offscreen, .a-price .a-offscreen");
          if (priceEl) {
            const priceText = priceEl.textContent.trim();
            const currMatch = priceText.match(/^([^\d]*)/);
            if (currMatch) result.currency = currMatch[1].trim();
          }

          // original_price
          result.original_price = 0;
          const origSelectors = [
            ".a-text-price[data-a-strike='true'] .a-offscreen",
            ".basisPrice .a-offscreen",
            "#listPrice .a-offscreen",
            ".a-price[data-a-color='secondary'] .a-offscreen",
            ".centralizedApexPriceSavingsPercentageMargin .a-offscreen",
            ".savingPriceOverride .a-offscreen",
          ];
          for (const sel of origSelectors) {
            const el = document.querySelector(sel);
            if (el) {
              const m = el.textContent.trim().match(/[\d,]+\.?\d*/);
              if (m) { result.original_price = parseFloat(m[0].replace(/,/g, "")); break; }
            }
          }

          // discount_percent
          result.discount_percent = 0;
          const discountEl = document.querySelector(".savingsPercentage");
          if (discountEl) {
            const dm = discountEl.textContent.match(/(\d+)\s*%/);
            if (dm) result.discount_percent = parseInt(dm[1]);
          }
          // fallback: calculate from original_price and current price
          if (!result.discount_percent && result.original_price > 0) {
            const currentPrice = parseFloat(document.querySelector("span.a-price .a-offscreen")?.textContent?.replace(/[^0-9.]/g, "") || "0");
            if (currentPrice > 0 && result.original_price > currentPrice) {
              result.discount_percent = Math.round((1 - currentPrice / result.original_price) * 100);
            }
          }

          // coupon_text
          result.coupon_text = "";
          const couponEl = document.querySelector("#couponBadge, .couponText, #vpcButton");
          if (couponEl) result.coupon_text = couponEl.textContent.trim();

          // deal_type
          result.deal_type = "";
          if (document.querySelector("#dealBadge, .lightning-deal-bxgy-container")) {
            result.deal_type = "Lightning Deal";
          } else if (document.querySelector("#dotd-badge, .dotdBadge")) {
            result.deal_type = "Deal of the Day";
          }

          // subscribe_save_price
          result.subscribe_save_price = 0;
          const snsEl = document.querySelector("#snsPrice .a-offscreen, #sns-base-price");
          if (snsEl) {
            const sm = snsEl.textContent.match(/[\d,]+\.?\d*/);
            if (sm) result.subscribe_save_price = parseFloat(sm[0].replace(/,/g, ""));
          }

          // is_prime
          result.is_prime = false;
          const primeSelectors = [
            "i.a-icon-prime", ".a-icon-prime", "#prime-tp",
            "#primeExclusiveBadge_feature_div",
            "#deliveryBlockMessage i.a-icon-prime",
          ];
          for (const sel of primeSelectors) {
            if (document.querySelector(sel)) { result.is_prime = true; break; }
          }
          if (!result.is_prime) {
            const primePatterns = ['"isPrime":true', '"isPrimeEligible":true', '"isAmazonFulfilled":true'];
            for (const pat of primePatterns) {
              if (html.includes(pat)) { result.is_prime = true; break; }
            }
          }

          // image_count
          result.image_count = document.querySelectorAll("#altImages img").length;

          // has_video
          result.has_video = !!document.querySelector("#videoBlock, .videoCount, #altImages .videoThumbnail");

          // description_text, description_html
          result.description_text = "";
          result.description_html = "";
          const descEl = document.querySelector("#productDescription") ||
                         document.querySelector("#productDescription_feature_div") ||
                         document.querySelector("#bookDescription_feature_div");
          if (descEl) {
            result.description_text = descEl.textContent.trim();
            result.description_html = descEl.innerHTML;
          }

          // aplus_html
          result.aplus_html = "";
          const aplusSelectors = ["#aplus", "#aplus_feature_div", "#aplus3p_feature_div", ".aplus-v2"];
          for (const sel of aplusSelectors) {
            const el = document.querySelector(sel);
            if (el && el.innerHTML.length > 100) { result.aplus_html = el.innerHTML; break; }
          }

          // specifications
          result.specifications = {};
          const specTable = document.querySelector("#productDetails_techSpec_section_1");
          if (specTable) {
            specTable.querySelectorAll("tr").forEach((row) => {
              const th = row.querySelector("th");
              const td = row.querySelector("td");
              if (th && td) result.specifications[th.textContent.trim()] = td.textContent.trim();
            });
          }
          const specTable2 = document.querySelector("#productDetails_detailBullets_sections1");
          if (specTable2) {
            specTable2.querySelectorAll("tr").forEach((row) => {
              const th = row.querySelector("th");
              const td = row.querySelector("td");
              if (th && td) {
                const key = th.textContent.trim();
                if (!result.specifications[key]) result.specifications[key] = td.textContent.trim();
              }
            });
          }
          if (Object.keys(result.specifications).length === 0) {
            const detailBullets = document.querySelector("#detailBullets_feature_div");
            if (detailBullets) {
              detailBullets.querySelectorAll("li").forEach((li) => {
                const spans = li.querySelectorAll("span span");
                if (spans.length >= 2) {
                  result.specifications[spans[0].textContent.trim().replace(/[\s:\u200f\u200e]+$/, "")] = spans[1].textContent.trim();
                }
              });
            }
          }

          // rating
          result.rating = 0;
          const ratingEl = document.querySelector("#acrPopover i.a-icon-star span.a-icon-alt") ||
                           document.querySelector("#averageCustomerReviews .a-icon-alt");
          if (ratingEl) {
            const rm = ratingEl.textContent.match(/([\d.]+)\s+out\s+of/);
            if (rm) result.rating = parseFloat(rm[1]);
          }

          // reviews_count
          result.reviews_count = 0;
          const reviewsEl = document.querySelector("#acrCustomerReviewText");
          if (reviewsEl) {
            const rcm = reviewsEl.textContent.match(/[\d,]+/);
            if (rcm) result.reviews_count = parseInt(rcm[0].replace(/,/g, ""));
          }

          // rating_distribution
          result.rating_distribution = {};
          const histTable = document.querySelector("#histogramTable, #cm_cr_dp_d_hist_table");
          if (histTable) {
            histTable.querySelectorAll("tr").forEach((row) => {
              const starEl = row.querySelector("td:first-child a, td:first-child span");
              const pctEl = row.querySelector("td.a-text-right a, td:nth-child(3) a, .a-size-small a");
              if (starEl && pctEl) {
                const sm2 = starEl.textContent.match(/(\d)/);
                const pm = pctEl.textContent.match(/(\d+)/);
                if (sm2 && pm) result.rating_distribution[sm2[1] + "_star"] = parseInt(pm[1]);
              }
            });
          }

          // answered_questions
          result.answered_questions = 0;
          const qaLink = document.querySelector("#askATFLink");
          if (qaLink) {
            const qm = qaLink.textContent.match(/([\d,]+)/);
            if (qm) result.answered_questions = parseInt(qm[0].replace(/,/g, ""));
          }

          // bsr_ranks
          result.bsr_ranks = [];
          const bsrSeen = new Set();
          const parseBSR = (container) => {
            if (!container) return;
            const text = container.textContent;
            const regex = /#([\d,]+)\s+in\s+([A-Za-z][A-Za-z0-9 &'\-]{2,50})/g;
            let bm;
            while ((bm = regex.exec(text)) !== null) {
              const rank = parseInt(bm[1].replace(/,/g, ""));
              const cat = bm[2].trim();
              const key = rank + "_" + cat;
              if (!bsrSeen.has(key)) {
                bsrSeen.add(key);
                result.bsr_ranks.push({ rank, category: cat });
              }
            }
          };
          document.querySelectorAll("#productDetails_detailBullets_sections1 tr, #productDetails_db_sections tr, #prodDetails tr").forEach((row) => {
            const th = row.querySelector("th");
            if (th && th.textContent.toLowerCase().includes("best sellers rank")) {
              parseBSR(row.querySelector("td"));
            }
          });
          if (result.bsr_ranks.length === 0) parseBSR(document.querySelector("#SalesRank"));
          if (result.bsr_ranks.length === 0) {
            const detBullets = document.querySelector("#detailBullets_feature_div");
            if (detBullets) {
              detBullets.querySelectorAll("li").forEach((li) => {
                if (li.textContent.toLowerCase().includes("best sellers rank")) parseBSR(li);
              });
            }
          }

          // seller, fulfilled_by (2026 Amazon accordion layout)
          result.seller = "";
          result.fulfilled_by = "";
          
          // Method 1: sfsb_accordion_head (축약 정보)
          const sfsbHead = document.querySelector("#sfsb_accordion_head");
          if (sfsbHead) {
            const rows = sfsbHead.querySelectorAll(".a-row");
            rows.forEach((row) => {
              const spans = row.querySelectorAll("span.a-size-small");
              if (spans.length >= 2) {
                const label = spans[0].textContent.trim().toLowerCase();
                const value = spans[1].textContent.trim();
                if (label.includes("ships from")) result.fulfilled_by = value;
                if (label.includes("sold by")) result.seller = value;
              }
            });
          }
          
          // Method 2: offer-display-feature-text (상세 정보, fallback)
          if (!result.seller) {
            const merchantText = document.querySelector('[offer-display-feature-name="desktop-merchant-info"].offer-display-feature-text .offer-display-feature-text-message');
            if (merchantText) result.seller = merchantText.textContent.trim();
          }
          if (!result.fulfilled_by) {
            const fulfillerText = document.querySelector('[offer-display-feature-name="desktop-fulfiller-info"].offer-display-feature-text .offer-display-feature-text-message');
            if (fulfillerText) result.fulfilled_by = fulfillerText.textContent.trim();
          }
          
          // Method 3: legacy selectors (이전 레이아웃 호환)
          if (!result.seller) {
            const tabBuybox = document.querySelector("#tabular-buybox");
            if (tabBuybox) {
              const rows = tabBuybox.querySelectorAll(".tabular-buybox-text");
              for (let ri = 0; ri < rows.length - 1; ri++) {
                const label = rows[ri].textContent.trim().toLowerCase();
                const valEl = rows[ri + 1];
                const valA = valEl.querySelector("a");
                const val = valA ? valA.textContent.trim() : valEl.textContent.trim();
                if (label.includes("sold by")) result.seller = val;
                if (label.includes("ships from")) result.fulfilled_by = val;
              }
            }
          }
          if (!result.seller) {
            const merchant = document.querySelector("#merchant-info");
            if (merchant) result.seller = merchant.textContent.trim();
          }
          if (!result.fulfilled_by) {
            if (result.seller && result.seller.toLowerCase().includes("amazon")) {
              result.fulfilled_by = "Amazon";
            } else if (document.documentElement.innerHTML.includes('"isAmazonFulfilled":true')) {
              result.fulfilled_by = "Amazon (FBA)";
            }
          }

          // is_addon
          result.is_addon = !!document.querySelector("#addOnItem_feature_div, .addOnItem");

          // delivery_info
          result.delivery_info = "";
          const delivEl = document.querySelector("#mir-layout-DELIVERY_BLOCK, #deliveryBlockMessage, #delivery-block-ags-dcp-block_0");
          if (delivEl) result.delivery_info = delivEl.textContent.trim();

          // schema_org
          result.schema_org = {};
          document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
            try {
              const d = JSON.parse(s.textContent);
              if (d && d["@type"] === "Product") result.schema_org = d;
              if (d && d["@graph"]) {
                d["@graph"].forEach((item) => {
                  if (item["@type"] === "Product") result.schema_org = item;
                });
              }
            } catch {}
          });

          // meta_tags
          result.meta_tags = {};
          document.querySelectorAll("meta[property], meta[name]").forEach((m) => {
            const key = m.getAttribute("property") || m.getAttribute("name");
            const val = m.getAttribute("content");
            if (key && val) result.meta_tags[key] = val;
          });

          return result;
        });

        // ========== 추가 수집 끝 ==========

        if (!imageBlockATFData?.colorImages?.initial) {
          throw new Error("이미지 데이터를 추출할 수 없습니다.");
        }
        const result = {
          url: request.url,
          asin,
          parent_asin: extraData.parent_asin || "",
          title,
          brand,
          price: +price,
          currency: extraData.currency || "",
          original_price: extraData.original_price || 0,
          discount_percent: extraData.discount_percent || 0,
          coupon_text: extraData.coupon_text || "",
          deal_type: extraData.deal_type || "",
          subscribe_save_price: extraData.subscribe_save_price || 0,
          is_prime: extraData.is_prime || false,
          options,
          quantity: +quantity,
          tags,
          category,
          overview,
          aboutThis,
          images: imageBlockATFData.colorImages.initial,
          image_count: extraData.image_count || 0,
          has_video: extraData.has_video || false,
          description_text: extraData.description_text || "",
          description_html: extraData.description_html || "",
          aplus_html: extraData.aplus_html || "",
          specifications: extraData.specifications || {},
          rating: extraData.rating || 0,
          reviews_count: extraData.reviews_count || 0,
          rating_distribution: extraData.rating_distribution || {},
          answered_questions: extraData.answered_questions || 0,
          bsr_ranks: extraData.bsr_ranks || [],
          date_first_available: extraData.date_first_available || "",
          availability: extraData.delivery_info ? "In Stock" : "",
          seller: extraData.seller || "",
          fulfilled_by: extraData.fulfilled_by || "",
          is_addon: extraData.is_addon || false,
          delivery_info: extraData.delivery_info || "",
          schema_org: extraData.schema_org || {},
          meta_tags: extraData.meta_tags || {},
        };

        sendToRenderer("crawler:data", result);
        crawlerLog.info(
          `[크롤링] 수집 완료 [${asin}] ${title.substring(0, 50)}...`,
        );
        sendLogToRenderer({
          label: request.label || "",
          url: request.url,
          message: `상품 정보 수집 완료 [${asin}]`,
          level: "success",
          timestamp: Date.now(),
        });
        await pushData(result);
      } catch (error) {
        log2.error(`┌ err : ${request.url}`);
        log2.error(`└ err : ${error}`);
        crawlerLog.error(`[크롤링] 수집 실패: ${request.url} - ${error}`);
      }
    },
  );
};
const router = crawlee.createPlaywrightRouter();
addProductListRouter(router);
addASINRouter(router);
addDetailRouter(router);
if (process.platform === "win32") {
  process.env.CRAWLEE_DISABLE_MEMORY_SNAPSHOT = "1";
  process.env.CRAWLEE_DISABLE_HEAP_SNAPSHOT = "1";
  process.env.CRAWLEE_DISABLE_V8_PROFILER = "1";
  process.env.CRAWLEE_DISABLE_PERFORMANCE_MONITORING = "1";
  process.env.CRAWLEE_DISABLE_SYSTEM_MONITORING = "1";
  process.env.CRAWLEE_DISABLE_WMIC = "1";
  process.env.CRAWLEE_DISABLE_SYSTEM_INFO = "1";
  process.env.CRAWLEE_DISABLE_PROCESS_MONITORING = "1";
  process.env.CRAWLEE_DISABLE_ALL_MONITORING = "1";
  process.env.CRAWLEE_DISABLE_PERSIST_STATE = "1";
  process.env.CRAWLEE_DISABLE_STATE_PERSISTENCE = "1";
  process.env.CRAWLEE_DISABLE_FILE_LOCKING = "1";
  process.env.CRAWLEE_DISABLE_STORAGE_LOCKING = "1";
  process.env.CRAWLEE_DISABLE_KEY_VALUE_STORE_LOCKING = "1";
  process.env.CRAWLEE_DISABLE_DATASET_LOCKING = "1";
  process.env.CRAWLEE_DISABLE_REQUEST_QUEUE_LOCKING = "1";
  process.env.CRAWLEE_DISABLE_POWER_SHELL = "1";
  process.env.CRAWLEE_DISABLE_WMI = "1";
  process.env.CRAWLEE_DISABLE_CIM = "1";
  process.env.CRAWLEE_DISABLE_COMPUTER_INFO = "1";
  process.env.CRAWLEE_DISABLE_PROCESS_INFO = "1";
  process.env.CRAWLEE_DISABLE_SERVICE_INFO = "1";
  process.env.CRAWLEE_DISABLE_COUNTER_INFO = "1";
  process.env.CRAWLEE_DISABLE_EVENT_LOG = "1";
  process.env.CRAWLEE_DISABLE_WIN_EVENT = "1";
  process.env.CRAWLEE_DISABLE_SYSTEM_MANAGEMENT = "1";
  process.env.CRAWLEE_DISABLE_WINDOWS_MANAGEMENT = "1";
  process.env.CRAWLEE_DISABLE_POWER_SHELL_COMMANDS = "1";
  process.env.CRAWLEE_DISABLE_WMI_QUERIES = "1";
  process.env.CRAWLEE_DISABLE_CIM_QUERIES = "1";
  process.env.CRAWLEE_DISABLE_SESSION_POOL = "1";
  process.env.CRAWLEE_DISABLE_SESSION_MANAGEMENT = "1";
  process.env.CRAWLEE_DISABLE_SESSION_STATE = "1";
  process.env.CRAWLEE_DISABLE_SESSION_PERSISTENCE = "1";
  process.env.CRAWLEE_DISABLE_SESSION_LOCKING = "1";
  process.env.CRAWLEE_DISABLE_SESSION_MONITORING = "1";
  process.env.CRAWLEE_DISABLE_SESSION_METRICS = "1";
  process.env.CRAWLEE_DISABLE_SESSION_TELEMETRY = "1";
  process.env.CRAWLEE_DISABLE_SESSION_POOL_STATE = "1";
  process.env.CRAWLEE_DISABLE_SESSION_POOL_MANAGEMENT = "1";
  process.env.CRAWLEE_DISABLE_SESSION_POOL_MONITORING = "1";
  process.env.CRAWLEE_DISABLE_SESSION_POOL_METRICS = "1";
  process.env.CRAWLEE_DISABLE_SESSION_POOL_TELEMETRY = "1";
  process.env.CRAWLEE_DISABLE_SESSION_POOL_LOCKING = "1";
  process.env.CRAWLEE_DISABLE_SESSION_POOL_PERSISTENCE = "1";
  process.env.CRAWLEE_DISABLE_SESSION_POOL_STATE_PERSISTENCE = "1";
  process.env.CRAWLEE_DISABLE_SESSION_POOL_STATE_LOCKING = "1";
  process.env.CRAWLEE_DISABLE_SESSION_POOL_STATE_MONITORING = "1";
  process.env.CRAWLEE_DISABLE_SESSION_POOL_STATE_METRICS = "1";
  process.env.CRAWLEE_DISABLE_SESSION_POOL_STATE_TELEMETRY = "1";
  process.env.CRAWLEE_DISABLE_CRAWLER_STATISTICS = "1";
  process.env.CRAWLEE_DISABLE_CRAWLER_STATISTICS_FILES = "1";
  process.env.CRAWLEE_DISABLE_CRAWLER_STATISTICS_JSON = "1";
  process.env.CRAWLEE_DISABLE_CRAWLER_STATISTICS_LOCK_FILES = "1";
  process.env.CRAWLEE_DISABLE_CRAWLER_STATISTICS_STORAGE = "1";
  process.env.CRAWLEE_DISABLE_CRAWLER_STATISTICS_DIRECTORIES = "1";
  process.env.CRAWLEE_DISABLE_CRAWLER_STATISTICS_MONITORING = "1";
  process.env.CRAWLEE_DISABLE_CRAWLER_STATISTICS_METRICS = "1";
  process.env.CRAWLEE_DISABLE_CRAWLER_STATISTICS_TELEMETRY = "1";
  process.env.CRAWLEE_DISABLE_CRAWLER_STATISTICS_PERSISTENCE = "1";
  process.env.CRAWLEE_DISABLE_CRAWLER_STATISTICS_STATE = "1";
  process.env.CRAWLEE_DISABLE_CRAWLER_STATISTICS_STATE_FILES = "1";
  process.env.CRAWLEE_DISABLE_CRAWLER_STATISTICS_STATE_JSON = "1";
  process.env.CRAWLEE_DISABLE_CRAWLER_STATISTICS_STATE_LOCK_FILES = "1";
  process.env.CRAWLEE_DISABLE_CRAWLER_STATISTICS_STATE_STORAGE = "1";
  process.env.CRAWLEE_DISABLE_CRAWLER_STATISTICS_STATE_DIRECTORIES = "1";
  process.env.CRAWLEE_DISABLE_CRAWLER_STATISTICS_STATE_MONITORING = "1";
  process.env.CRAWLEE_DISABLE_CRAWLER_STATISTICS_STATE_METRICS = "1";
  process.env.CRAWLEE_DISABLE_CRAWLER_STATISTICS_STATE_TELEMETRY = "1";
  process.env.CRAWLEE_DISABLE_SDK_FILES = "1";
  process.env.CRAWLEE_DISABLE_SDK_JSON = "1";
  process.env.CRAWLEE_DISABLE_SDK_LOCK_FILES = "1";
  process.env.CRAWLEE_DISABLE_SDK_STORAGE = "1";
  process.env.CRAWLEE_DISABLE_SDK_DIRECTORIES = "1";
  process.env.CRAWLEE_DISABLE_SDK_MONITORING = "1";
  process.env.CRAWLEE_DISABLE_SDK_METRICS = "1";
  process.env.CRAWLEE_DISABLE_SDK_TELEMETRY = "1";
  process.env.CRAWLEE_DISABLE_SDK_PERSISTENCE = "1";
  process.env.CRAWLEE_DISABLE_SDK_STATE = "1";
  process.env.CRAWLEE_DISABLE_SDK_STATE_FILES = "1";
  process.env.CRAWLEE_DISABLE_SDK_STATE_JSON = "1";
  process.env.CRAWLEE_DISABLE_SDK_STATE_LOCK_FILES = "1";
  process.env.CRAWLEE_DISABLE_SDK_STATE_STORAGE = "1";
  process.env.CRAWLEE_DISABLE_SDK_STATE_DIRECTORIES = "1";
  process.env.CRAWLEE_DISABLE_SDK_STATE_MONITORING = "1";
  process.env.CRAWLEE_DISABLE_SDK_STATE_METRICS = "1";
  process.env.CRAWLEE_DISABLE_SDK_STATE_TELEMETRY = "1";
  global.CRAWLEE_DISABLE_MEMORY_SNAPSHOT = true;
  global.CRAWLEE_DISABLE_HEAP_SNAPSHOT = true;
  global.CRAWLEE_DISABLE_V8_PROFILER = true;
  global.CRAWLEE_DISABLE_PERFORMANCE_MONITORING = true;
  global.CRAWLEE_DISABLE_SYSTEM_MONITORING = true;
  global.CRAWLEE_DISABLE_WMIC = true;
  global.CRAWLEE_DISABLE_SYSTEM_INFO = true;
  global.CRAWLEE_DISABLE_ALL_MONITORING = true;
  global.CRAWLEE_DISABLE_V8_ENGINE = true;
  global.CRAWLEE_DISABLE_V8_PROFILING = true;
  global.CRAWLEE_DISABLE_V8_MEMORY_MANAGEMENT = true;
  global.CRAWLEE_DISABLE_V8_DEBUGGING = true;
  global.CRAWLEE_DISABLE_V8_INSPECTION = true;
  global.CRAWLEE_DISABLE_V8_TRACING = true;
  global.CRAWLEE_DISABLE_V8_COVERAGE = true;
  global.CRAWLEE_DISABLE_V8_SOURCE_MAPS = true;
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ""} --no-heap-snapshot --no-memory-snapshot --no-v8-profiler --no-perf-hooks --no-inspector`;
}
const blockUnnecessaryResources = async (crawlingContext) => {
  const { page } = crawlingContext;
  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    const url = route.request().url();
    const blocked = ["media", "font", "stylesheet"];
    const blockedUrls = [
      "google-analytics.com",
      "googletagmanager.com",
      "doubleclick.net",
      "facebook.net",
      "googlesyndication.com",
      "amazon-adsystem.com",
      "fls-na.amazon.com",
      "unagi.amazon.com",
      "completion.amazon.com",
    ];
    if (blocked.includes(type)) {
      return route.abort();
    }
    if (blockedUrls.some((domain) => url.includes(domain))) {
      return route.abort();
    }
    return route.continue();
  });
};
const navigationHook = async (crawlingContext) => {
  await pageSolver1(crawlingContext);
  await checkDelivery(crawlingContext);
};
const pageTest = async (crawlingContext) => {
  const { page } = crawlingContext;
  const hasCaptcha = (await page.locator("#captchacharacters").count()) > 0;
  const pageTitle = await page.title();
  crawlee.log.info(`pageSolver1 : title : ${pageTitle}`);
  const has404503 =
    ["Sorry! Something went wrong!", "Page Not Found", "Amazon.com"].indexOf(
      pageTitle,
    ) > -1;
  return {
    fail: hasCaptcha || has404503,
    // 하나라도 true면 실패
    detail: {
      hasCaptcha,
      has404503,
    },
  };
};
const pageSolver1 = async (crawlingContext) => {
  const { page } = crawlingContext;
  const pageUrl = page.url();
  if (!(await pageTest(crawlingContext)).fail) return;
  crawlee.log.info(`pageSolver1 : pageTest Fail`);
  await page.goto("https://www.amazon.com");
  await page.waitForURL("https://www.amazon.com");
  crawlee.log.info(`pageSolver2 : Start`);
  await pageSolver2(crawlingContext, 0);
  crawlee.log.info(`pageSolver2 : restore url`);
  await page.waitForTimeout(777);
  await page.goto(pageUrl);
  await page.waitForLoadState("domcontentloaded");
  crawlee.log.info(`pageSolver2 : Done`);
};
const pageSolver2 = async (crawlingContext, retryCount) => {
  const { page } = crawlingContext;
  crawlee.log.info(`pageSolver2 : retryCount : ${retryCount}`);
  if (retryCount > 5) return;
  let result = await pageTest(crawlingContext);
  crawlee.log.info(`pageSolver2 : step1`, result);
  if (!result.fail) return;
  await page.mouse.move(0, 0);
  await page.mouse.move(Math.random() * 100, Math.random() * 100);
  if (result.fail && result.detail.hasCaptcha) {
    result = await pageTest(crawlingContext);
    crawlee.log.info(`pageSolver2 : step2`, result);
    if (!result.fail) return;
    if (result.fail && result.detail.has404503) {
      await page.mouse.move(0, 0);
      await page.mouse.move(Math.random() * 100, Math.random() * 100);
      crawlee.log.info(`pageSolver2 : 5.`);
      await page
        .getByAltText("Amazon.com")
        .or(
          page.getByAltText("Amazon", {
            exact: true,
          }),
        )
        .click();
      await page.waitForURL("https://www.amazon.com");
      await page.waitForTimeout(1500);
    }
  } else if (result.fail && result.detail.has404503) {
    crawlee.log.info(`pageSolver2 : 3-2.`);
    try {
      const continueShoppingButton = page.locator(
        'button[type="submit"].a-button-text[alt="Continue shopping"]',
      );
      if (await continueShoppingButton.isVisible()) {
        await continueShoppingButton.click();
        await page.waitForTimeout(1e3);
        await page.waitForLoadState("domcontentloaded");
        crawlee.log.info("Continue shopping Clicked");
      }
    } catch (error) {
      crawlee.log.info("Continue shopping Not Found");
    }
  }
  await pageSolver2(crawlingContext, ++retryCount);
};
const checkDelivery = async (crawlingContext) => {
  const { page } = crawlingContext;
  try {
    for (let index = 0; index < 3; index++) {
      const destinationLoc = page.locator("#glow-ingress-line2");
      const destination =
        (await destinationLoc.textContent({ timeout: 5e3 }).catch(() => "")) ||
        "";
      if (destination.includes("19901")) {
        return;
      }
      try {
        crawlee.log.info(`[배송지] 변경 시도 ${index + 1}/3`);
        await page.locator("#glow-ingress-block").click();
        await page.waitForSelector("#GLUXZipUpdateInput", {
          state: "visible",
          timeout: 3e4,
        });
        await page.locator("#GLUXZipUpdateInput").fill("19901");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(1e3);
        const alreadyChanged = await page
          .locator("#GLUXZipConfirmationSection")
          .isVisible();
        if (alreadyChanged) {
          await page
            .locator('.a-popover-footer [name="glowDoneButton"]')
            .click({
              timeout: 3e3,
            });
        } else {
          await page.waitForSelector("#GLUXHiddenSuccessDialog", {
            state: "visible",
            timeout: 2750,
          });
          await page.locator(".a-popover-footer #GLUXConfirmClose").click({
            timeout: 2750,
          });
          await page.waitForTimeout(1e3);
          await page.waitForLoadState("domcontentloaded", {
            timeout: 2750,
          });
        }
        crawlee.log.info(`[배송지] 변경 완료`);
        break;
      } catch (error) {
        crawlee.log.error(`[배송지] 변경 실패 (${index + 1}/3): ${error}`);
        await page.reload();
      }
    }
  } catch (error) {
    crawlee.log.error(`[배송지] checkDelivery 실패: ${error}`);
  }
};
process.env.PLAYWRIGHT_DISABLE_MEMORY_SNAPSHOT = "1";
process.env.PLAYWRIGHT_DISABLE_CRASH_REPORTS = "1";
class Crawler {
  /** 현재 실행 중인 Playwright 크롤러 인스턴스 */
  static instance;
  /** 크롤링 중지 사유 (사용자 중지, 에러 등) */
  static stopReason;
  /** 현재 작업의 스토리지 ID (타임스탬프 기반: MMDD_HHmmss) */
  static storageId;
  /** 크롤링 중단 플래그 - 라우터 핸들러에서 체크하여 즉시 중단 */
  static isAborted = false;
  /**
   * ====================================
   * 크롤러 초기화 메서드
   * ====================================
   *
   * PlaywrightCrawler 인스턴스를 생성하고 설정합니다.
   * 매 크롤링 작업마다 새로운 인스턴스를 생성합니다.
   *
   * @param {boolean} isHeadless - Headless 모드 여부 (false면 브라우저 UI 표시)
   * @param {boolean} isPrime - Amazon Prime 전용 상품 필터링 여부
   *
   * 초기화 과정:
   * 1. 중지 사유 초기화
   * 2. 스토리지 ID 생성 (타임스탬프)
   * 3. Prime 필터링 설정 (글로벌 변수)
   * 4. Crawlee Configuration 생성
   * 5. PlaywrightCrawler 인스턴스 생성
   *
   * Configuration 설정:
   * - defaultBrowserPath: 앱에 포함된 Chromium 경로
   * - defaultDatasetId: 크롤링 데이터 저장 ID
   * - defaultRequestQueueId: URL 큐 ID
   * - defaultKeyValueStoreId: 메타데이터 저장소 ID
   * - memoryMbytes: 메모리 제한 (4GB)
   * - persistStorage: 데이터 영구 저장 활성화
   */
  static async init(isHeadless = false, isPrime = false) {
    this.stopReason = null;
    this.isAborted = false;
    this.storageId = dayjs().format("MMDD_HHmmss");
    global.isPrime = isPrime;
    const config = new crawlee.Configuration({
      // Chromium 브라우저 경로 (앱에 포함된 버전 사용)
      defaultBrowserPath: path.join(
        electron.app.getPath("sessionData"),
        "/browser/chromium-1181/chrome-win/chrome.exe",
      ),
      chromeExecutablePath: path.join(
        electron.app.getPath("sessionData"),
        "/browser/chromium-1181/chrome-win/chrome.exe",
      ),
      // 스토리지 ID 설정 (모두 같은 ID 사용)
      defaultDatasetId: this.storageId,
      // 크롤링 데이터
      defaultRequestQueueId: this.storageId,
      // URL 큐
      defaultKeyValueStoreId: this.storageId,
      // 메타데이터
      // 메모리 및 성능 설정
      memoryMbytes: 4096,
      // 최대 메모리 사용량 4GB
      persistStateIntervalMillis: 6e4,
      // 60초마다 상태 저장
      persistStorage: true,
      // 데이터 영구 저장 활성화
      systemInfoV2: true,
      // 시스템 정보 v2 사용
    });
    this.instance = new crawlee.PlaywrightCrawler(
      {
        // 요청 처리 라우터 (URL 패턴에 따라 다른 핸들러 실행)
        requestHandler: router,
        // Headless 모드 설정 (isHeadless가 false면 브라우저 UI 표시)
        headless: !isHeadless,
        // 페이지 이동 후 실행할 훅 (로그 전송 등)
        preNavigationHooks: [blockUnnecessaryResources],
        postNavigationHooks: [navigationHook],
        // 재시도 및 타임아웃 설정
        maxRequestRetries: 3,
        // 실패 시 최대 3번 재시도
        requestHandlerTimeoutSecs: 180,
        // 요청당 최대 10분 (복잡한 페이지 대응)
        // 동시 실행 수 (1로 설정하여 순차 실행)
        maxConcurrency: 1,
        /**
         * Chromium 실행 옵션
         * 안정성과 wmic 오류 방지를 위한 다양한 플래그 설정
         */
        launchContext: {
          launchOptions: {
            args: [
              "--disable-gpu",
              // GPU 비활성화 (서버 환경 대응)
              "--no-sandbox",
              // 샌드박스 비활성화
              "--disable-dev-shm-usage",
              // /dev/shm 사용 안 함
              "--disable-setuid-sandbox",
              // setuid 샌드박스 비활성화
              "--disable-memory-snapshot",
              // 메모리 스냅샷 비활성화 (wmic 방지)
              "--disable-background-timer-throttling",
              // 백그라운드 타이머 제한 해제
              "--disable-backgrounding-occluded-windows",
              // 가려진 창 백그라운드 처리 비활성화
              "--disable-renderer-backgrounding",
              // 렌더러 백그라운드 처리 비활성화
              "--disable-features=TranslateUI",
              // 번역 UI 비활성화
              "--disable-ipc-flooding-protection",
              // IPC 플러딩 보호 비활성화
              "--disable-crash-reporter",
              // 크래시 리포터 비활성화
              "--disable-extensions",
              // 확장 프로그램 비활성화
              "--disable-plugins",
              // 플러그인 비활성화
              "--disable-default-apps",
              // 기본 앱 비활성화
              "--disable-sync",
              // 동기화 비활성화
              "--disable-translate",
              // 번역 기능 비활성화
              "--disable-web-security",
              // 웹 보안 비활성화 (CORS 무시)
              "--disable-features=VizDisplayCompositor",
              // Viz Display Compositor 비활성화
            ],
            // 자동화 감지 방지 (Amazon 봇 탐지 우회)
            ignoreDefaultArgs: ["--enable-automation"],
            // 시그널 핸들러 비활성화 (프로세스 제어 직접 관리)
            handleSIGINT: false,
            handleSIGTERM: false,
            handleSIGHUP: false,
          },
        },
      },
      config,
      // 위에서 정의한 Configuration 객체 전달
    );
  }
  /**
   * ====================================
   * 크롤러 중지 메서드
   * ====================================
   *
   * 실행 중인 크롤링 작업을 정상적으로 중지합니다.
   * 진행 중인 요청을 완료하고 리소스를 정리합니다.
   *
   * @param {string} reason - 중지 사유 (사용자에게 표시됨)
   * @param {boolean} silence - true면 UI에 알림 표시 안 함
   *
   * 중지 과정:
   * 1. 중지 사유 저장
   * 2. Autoscaled Pool 중단 (요청 큐 중지)
   * 3. 모든 브라우저 인스턴스 닫기
   * 4. 브라우저 풀 파괴
   * 5. 크롤러 리소스 정리
   */
  static async stop(reason, silence = false) {
    if (!this.instance) return;
    this.isAborted = true;

    // 중지 전 수집된 데이터 수 기록
    let savedCount = 0;
    try {
      const dataset = await Crawler.DataSetOpen(Crawler.storageId);
      const info = await dataset.getInfo();
      savedCount = info?.itemCount || 0;
      crawlerLog.info(`[크롤러] 중지 시점 저장된 상품: ${savedCount}개`);
    } catch (e) {
      crawlerLog.warn(`[크롤러] 중지 시 데이터 확인 실패: ${e}`);
    }

    this.stopReason = {
      reason: reason || (savedCount > 0
        ? `작업이 중지되었습니다. (${savedCount}개 상품 저장됨)`
        : "작업이 중지되었습니다."),
      silence,
      savedCount,
      storageId: this.storageId,
    };
    await this.instance.autoscaledPool?.abort();
    await this.instance.browserPool.closeAllBrowsers();
    await this.instance.browserPool.destroy();
    await this.instance.teardown();
  }

  /**
   * 크롤링 중단 여부 확인 헬퍼
   * 라우터 핸들러에서 장시간 작업 사이에 호출하여
   * 중단 요청이 있으면 에러를 throw합니다.
   */
  static checkAborted() {
    if (this.isAborted) {
      throw new Error("CRAWLER_ABORTED");
    }
  }
  /**
   * ====================================
   * Chromium 프로세스 강제 종료 메서드
   * ====================================
   *
   * 시스템에서 실행 중인 모든 Chromium 프로세스를 찾아 강제 종료합니다.
   * 정상 종료가 실패했을 때나 좀비 프로세스를 정리할 때 사용됩니다.
   *
   * 동작 방식:
   * 1. 'chrome' 이름을 가진 모든 프로세스 검색
   * 2. '--enable-automation' 플래그가 있는 프로세스만 필터링
   *    (일반 사용자 Chrome과 구분)
   * 3. 해당 프로세스 강제 종료 (SIGKILL)
   *
   * 주의:
   * - 크롤러가 실행한 Chrome만 종료 (사용자 Chrome은 안전)
   * - 에러 발생 시 무시 (이미 종료된 프로세스 등)
   */
  static async kill() {
    try {
      const chromProcList = await find("name", "chrome");
      chromProcList.forEach((proc) => {
        if (proc.cmd.includes("--enable-automation")) {
          try {
            process.kill(proc.pid);
          } catch (error) {}
        }
      });
    } catch (error) {}
  }
  /**
   * ====================================
   * Dataset 열기 메서드
   * ====================================
   *
   * 특정 스토리지 ID의 Dataset을 엽니다.
   * Dataset은 크롤링한 상품 데이터를 저장하는 저장소입니다.
   *
   * @param {string} storageId - 스토리지 ID (예: '0818_143025')
   * @returns {Dataset<product>} Product 타입의 Dataset 인스턴스
   *
   * 사용 예시:
   * ```typescript
   * const dataset = await Crawler.DataSetOpen('0818_143025');
   * const data = await dataset.getData(); // 모든 상품 조회
   * ```
   */
  static DataSetOpen(storageId) {
    return crawlee.Dataset.open(storageId, {
      config: new crawlee.Configuration({
        defaultRequestQueueId: storageId,
        defaultDatasetId: storageId,
        defaultKeyValueStoreId: storageId,
      }),
    });
  }
  /**
   * ====================================
   * KeyValueStore 열기 메서드
   * ====================================
   *
   * 특정 스토리지 ID의 KeyValueStore를 엽니다.
   * KeyValueStore는 메타데이터와 설정을 저장하는 key-value 저장소입니다.
   *
   * @param {string} storageId - 스토리지 ID (예: '0818_143025')
   * @returns {KeyValueStore} KeyValueStore 인스턴스
   *
   * 저장되는 데이터 예시:
   * - 'deselected': 업로드에서 제외된 ASIN 목록 (string[])
   * - 'settings': 작업별 설정 정보
   * - 'statistics': 작업 통계 (총 처리 수, 성공/실패 등)
   *
   * 사용 예시:
   * ```typescript
   * const kvStore = await Crawler.KeyValueStoreOpen('0818_143025');
   * const deselected = await kvStore.getValue<string[]>('deselected');
   * ```
   */
  static KeyValueStoreOpen(storageId) {
    return crawlee.KeyValueStore.open(storageId, {
      config: new crawlee.Configuration({
        defaultRequestQueueId: storageId,
        defaultDatasetId: storageId,
        defaultKeyValueStoreId: storageId,
      }),
    });
  }
}
const crawlerIPC = () => {
  electron.ipcMain.handle(
    "crawler:run",
    async (_event, requests, isHeadless = false, isPrime = false) => {
      try {
        log.info(
          "crawler:run",
          requests,
          "headless:",
          isHeadless,
          "isPrime:",
          isPrime,
        );
        await Crawler.kill();
        await Crawler.init(isHeadless, isPrime);
        crawlerLog.info(
          `[크롤링] === 시작 === URL: ${requests.length}개, Headless: ${isHeadless}, Prime: ${isPrime}`,
        );
        for (const req of requests) {
          crawlerLog.info(`[크롤링] 수집링크: ${req.url} (${req.label})`);
        }
        Crawler.instance
          ?.run(requests)
          .then(async (stats) => {
            log.info("crawler:instance:run complete", Crawler.stopReason);
            try {
              const dataset = await Crawler.DataSetOpen(Crawler.storageId);
              const info = await dataset.getInfo();
              const savedCount = info?.itemCount || 0;
              crawlerLog.info(
                `[크롤링] === 완료 === 저장: ${savedCount}개, 처리: ${stats.requestsFinished}개, 실패: ${stats.requestsFailed}개`,
              );
            } catch (error) {
              crawlerLog.info(
                `[크롤링] === 완료 === 처리: ${stats.requestsFinished}개, 실패: ${stats.requestsFailed}개`,
              );
            }
            sendToRenderer("crawler:complete", Crawler.stopReason);
          })
          .catch((error) => {
            log.error("crawler:instance:error", error);
            crawlerLog.error(`[크롤링] 중단: ${error}`);
          })
          .finally(async () => {
            await Crawler.kill();
          });
        sendLogToRenderer({
          label: "",
          url: "",
          message: "작업 시작",
          level: "info",
          timestamp: Date.now(),
        });
        return Crawler.storageId;
      } catch (error) {
        log.error("crawler:run:error", error);
        return "";
      }
    },
  );
  electron.ipcMain.handle("crawler:stop", async () => {
    await Crawler.stop();
  });
  electron.ipcMain.handle("crawler:getDataInfo", async (_event, storageId) => {
    const dsStorage = await Crawler.DataSetOpen(storageId);
    const kvStorage = await Crawler.KeyValueStoreOpen(storageId);
    const dsStorageInfo = await dsStorage.getInfo();
    if (!dsStorageInfo) return;
    const deselected = (await kvStorage.getValue("deselected")) || [];
    return {
      total: dsStorageInfo.itemCount,
      // 전체 아이템 수
      selected: dsStorageInfo.itemCount - deselected.length,
      // 선택된 아이템 수
      deselected: deselected.length,
      // 제외된 아이템 수
    };
  });
  electron.ipcMain.handle(
    "crawler:getData",
    async (_event, storageId, page = 1, limit = 50) => {
      const dsStorage = await Crawler.DataSetOpen(storageId);
      const kvStorage = await Crawler.KeyValueStoreOpen(storageId);
      let offset = (page - 1) * limit;
      const datasetContent = await dsStorage.getData({
        offset,
        // 시작 위치
        limit,
        // 조회할 개수
      });
      const deselected = (await kvStorage.getValue("deselected")) || [];
      datasetContent.items = datasetContent.items.map((item) => {
        item.selected = !deselected.includes(item.asin);
        return item;
      });
      return datasetContent;
    },
  );
  electron.ipcMain.handle(
    "crawler:selectData",
    async (_event, storageId, select, asins) => {
      const kvStorage = await Crawler.KeyValueStoreOpen(storageId);
      let deselected = (await kvStorage.getValue("deselected")) || [];
      if (select) {
        await kvStorage.setValue(
          "deselected",
          Array.from(new Set(lodash.difference(deselected, asins))),
        );
      } else {
        await kvStorage.setValue(
          "deselected",
          Array.from(new Set(deselected.concat(asins))),
        );
      }
    },
  );
};
const electronIPC = () => {
  electron.ipcMain.handle("app:version", async () => {
    const version = electron.app.getVersion();
    return process.env.VITE_ADMIN_MODE === "true"
      ? `${version}-admin`
      : version;
  });
  electron.ipcMain.handle("dialog:open", async () => {
    const storagePath = path.join(
      electron.app.getPath("sessionData"),
      "./storage/datasets",
    );
    if (!fs.existsSync(storagePath))
      return {
        error:
          "저장된 데이터가 없습니다.\n최소 한번의 작업을 완료한뒤 다시 시도해주세요.",
        storageId: "",
      };
    const { canceled, filePaths } = await electron.dialog.showOpenDialog({
      defaultPath: storagePath,
      // 기본 열기 경로
      properties: ["openDirectory"],
      // 폴더만 선택 가능
    });
    return {
      error: "",
      storageId: canceled ? "" : path.basename(filePaths[0]),
      // 폴더명만 추출
    };
  });
  electron.ipcMain.handle("shell:open", (_event, link) => {
    electron.shell.openExternal(link);
  });
  electron.ipcMain.handle("shell:logFolder", (_event) => {
    electron.shell.openExternal(electron.app.getPath("logs"));
  });
  electron.ipcMain.handle("spawn:launchChromium", async () => {
    const chromePath = path.join(
      electron.app.getPath("sessionData"),
      "/browser/chromium-1181/chrome-win/chrome.exe",
    );
    child_process.spawn(chromePath, [
      " --incognito",
      // 시크릿 모드
      "https://www.amazon.com",
      // 시작 페이지
    ]);
  });
};
const electronStore = new Store({
  schema: {
    appSettings: {
      type: "object",
      // 기본값: 빈 설정
      default: {
        shopifySettings: {
          shopifyStoreName: "",
          shopifyAccessToken: "",
          margin: 0,
        },
      },
      // 필드 정의
      properties: {
        shopifySettings: {
          type: "object",
          properties: {
            shopifyStoreName: {
              type: "string",
              // Shopify 스토어 이름
            },
            shopifyAccessToken: {
              type: "string",
              // Admin API 토큰
            },
            margin: {
              type: "number",
              // 가격 마진 (%)
              default: 10,
              // 기본값 10%
            },
          },
          required: ["shopifyStoreName", "shopifyAccessToken", "margin"],
          // 필수 필드
        },
      },
      required: ["shopifySettings"],
      // shopifySettings는 필수
    },
  },
});
const storeIPC = () => {
  electron.ipcMain.handle("store:loadSettings", async (_event) => {
    return electronStore.get("appSettings");
  });
  electron.ipcMain.handle("store:saveSettings", async (_event, settings) => {
    electronStore.set("appSettings", settings);
  });
};
var BulkOperationStatus = /* @__PURE__ */ ((BulkOperationStatus2) => {
  BulkOperationStatus2["Canceled"] = "CANCELED";
  BulkOperationStatus2["Canceling"] = "CANCELING";
  BulkOperationStatus2["Completed"] = "COMPLETED";
  BulkOperationStatus2["Created"] = "CREATED";
  BulkOperationStatus2["Expired"] = "EXPIRED";
  BulkOperationStatus2["Failed"] = "FAILED";
  BulkOperationStatus2["Running"] = "RUNNING";
  return BulkOperationStatus2;
})(BulkOperationStatus || {});
var ProductStatus = /* @__PURE__ */ ((ProductStatus2) => {
  ProductStatus2["Active"] = "ACTIVE";
  ProductStatus2["Archived"] = "ARCHIVED";
  ProductStatus2["Draft"] = "DRAFT";
  return ProductStatus2;
})(ProductStatus || {});
const axiosInstance = axios.create({
  baseURL: "https://allmarketing.mycafe24.com",
  // Cafe24 서버
  timeout: 1e4,
  // 10초 타임아웃
  headers: {
    "Content-Type": "multipart/form-data",
    // FormData 전송
  },
});
const getMatchCategory = async (amazon_category) => {
  try {
    console.error(`[API] amazon_category : ${amazon_category}`);
    const formData = new FormData();
    formData.append("amazon_category", amazon_category);
    const { data } = await axiosInstance.post(
      "/api/getCategoryByAmazon",
      formData,
    );
    return {
      data,
      // Shopify 카테고리명
    };
  } catch (error) {
    console.error(`[API] match failed : ${amazon_category}`, error);
    throw error;
  }
};
class Shopify {
  // 크롤링 데이터 스토리지 ID (예: "0818_143025")
  storageId;
  // Shopify Admin API 버전
  apiVersion = "2025-07";
  // Shopify 스토어 이름 (예: "mystore" → mystore.myshopify.com)
  shopifyStoreName;
  // Shopify Admin API 액세스 토큰 (shpat_xxxxx)
  shopifyAccessToken;
  // 가격 마진 퍼센트 (예: 10 → 10% 마진)
  margin;
  // Shopify Admin GraphQL API 클라이언트
  client;
  // 재고 위치 캐시 (한 번 조회 후 재사용)
  cachedLocations = null;
  // 컬렉션 캐시 (카테고리 이름 → 컬렉션 ID 매핑)
  cachedCollections = /* @__PURE__ */ new Map();
  // Shopify 기존 상품 Handle 캐시 (중복 업로드 방지용)
  // Handle = ASIN이므로, 이미 업로드된 상품의 ASIN 목록
  cachedExistingHandles = null;
  // 카테고리 매핑 규칙 (태그 기반 매칭용)
  // cleaned_all.csv에서 로드: [{ amazonCategory: "Laptops", tags: Set(["Electronics", "Laptops"]), taxonomyId: "sg-4-17-2-17" }]
  categoryMappingRules = [];
  // 마지막으로 생성된 발행용 JSONL 파일 경로 (publishablePublish용)
  lastPublishJsonlPath = null;
  // prepareData에서 계산된 통계 (업로드 완료 시 사용)
  lastPrepareStats = null;
  // 일일 제한 도달 플래그 (VARIANT_THROTTLE_EXCEEDED)
  // true가 되면 남은 배치 스킵
  dailyLimitReached = false;
  dailyLimitSkipped = 0;
  // 일일 제한으로 실패/스킵된 총 상품 수
  // 마지막 배치 결과 (결과 파싱에서 업데이트, 메인 루프에서 사용)
  lastBatchSuccess = 0;
  lastBatchFailed = 0;
  // 외부에서 주입된 공유 데이터 (다중 업로드 시 사용)
  sharedPreparedData = null;
  // 사용자가 선택한 재고 위치 ID (수동 선택 시)
  selectedLocationId = null;
  /**
   * 업로드 진행 상황 콜백 (배치 시작/완료/실패 시마다 호출)
   *
   * [다중배포 전용] 단일 업로드에서는 사용하지 않음
   * - 다중배포(MultiUpload)에서 각 스토어별 진행 상황을 UI에 표시하기 위해 사용
   * - 단일 업로드에서는 이 콜백을 설정하지 않으므로 호출되지 않음
   */
  onProgress = null;
  /**
   * ====================================
   * Shopify 클래스 생성자
   * ====================================
   *
   * electron-store에서 Shopify 설정을 읽어와 API 클라이언트를 초기화합니다.
   *
   * @param {string} storageId - 크롤링 데이터가 저장된 Dataset ID
   * @param {number} storeIndex - 사용할 OAuth 스토어 인덱스 (옵션)
   *                              - undefined: 저장된 selectedStoreIndex 사용
   *                              - 0 이상: 해당 인덱스의 OAuth 스토어 사용
   *                              - -1: 레거시 스토어 사용
   *
   * 초기화 과정:
   * 1. electron-store에서 appSettings 읽기
   * 2. Shopify 스토어 이름, 액세스 토큰, 마진 추출
   * 3. Admin API 클라이언트 생성 (GraphQL 통신용)
   *
   * 사용 예시:
   * ```typescript
   * const shopify = new Shopify('0818_143025');      // 기본 스토어
   * const shopify2 = new Shopify('0818_143025', 0);  // 첫 번째 OAuth 스토어
   * const shopify3 = new Shopify('0818_143025', -1); // 레거시 스토어
   * await shopify.upload(); // 업로드 시작
   * ```
   */
  // 현재 스토어 인덱스 (토큰 갱신 시 저장용)
  currentStoreIndex = 0;
  constructor(storageId, storeIndex) {
    this.storageId = storageId;
    const settings = electronStore.get("appSettings");
    const stores = settings.shopifySettingsV2?.stores || [];
    if (stores.length === 0) {
      throw new Error(
        "연동된 Shopify 스토어가 없습니다. 설정에서 스토어를 추가해주세요.",
      );
    }
    const selectedIndex =
      storeIndex ?? settings.shopifySettingsV2?.selectedStoreIndex ?? 0;
    const selectedStore = stores[selectedIndex] || stores[0];
    this.currentStoreIndex = selectedIndex;
    this.shopifyStoreName = selectedStore.storeName.replace(
      ".myshopify.com",
      "",
    );
    this.shopifyAccessToken = selectedStore.accessToken;
    this.margin = selectedStore.margin;
    this.client = adminApiClient.createAdminApiClient({
      storeDomain: `${this.shopifyStoreName}.myshopify.com`,
      apiVersion: this.apiVersion,
      accessToken: this.shopifyAccessToken,
    });
  }
  /**
   * 토큰 만료 여부 확인 및 자동 갱신
   * OAuth 스토어인 경우 (clientId가 있는 경우) 토큰 만료 시 자동 갱신
   * @throws {Error} 토큰 갱신 실패 시 에러 throw
   */
  async ensureValidToken() {
    const settings = electronStore.get("appSettings");
    const stores = settings.shopifySettingsV2?.stores || [];
    const store = stores[this.currentStoreIndex];
    if (!store) return;
    if (!store.clientId || !store.clientSecret) {
      log.info(`[Shopify] Direct token - no refresh needed`);
      return;
    }
    const now = Date.now();
    const expiresAt = store.tokenExpiresAt || 0;
    const fifteenMinutes = 15 * 60 * 1e3;
    if (expiresAt === 0) {
      return;
    }
    if (now < expiresAt - fifteenMinutes) {
      log.info(
        `[Shopify] Token valid (expires: ${new Date(expiresAt).toLocaleString()})`,
      );
      return;
    }
    if (!store.refreshToken) {
      log.warn(`[Shopify] No refreshToken - cannot refresh. Re-auth required.`);
      throw new Error(
        "OAuth 토큰이 만료되었으나 refreshToken이 없습니다. 스토어를 다시 연동해주세요.",
      );
    }
    log.info(`[Shopify] Token refresh starting...`);
    const response = await fetch$1(
      `https://${store.storeName}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: store.clientId,
          client_secret: store.clientSecret,
          grant_type: "refresh_token",
          refresh_token: store.refreshToken,
        }),
      },
    );
    if (!response.ok) {
      const errorText = await response.text();
      log.error(
        `[Shopify] Token refresh HTTP error: ${response.status} - ${errorText}`,
      );
      throw new Error(
        `토큰 갱신 실패 (${response.status}): 스토어를 다시 연동해주세요.`,
      );
    }
    const tokenData = await response.json();
    const updatedStore = {
      ...store,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || store.refreshToken,
      tokenExpiresAt: tokenData.expires_in
        ? Date.now() + tokenData.expires_in * 1e3
        : void 0,
    };
    const newStores = [...stores];
    newStores[this.currentStoreIndex] = updatedStore;
    electronStore.set("appSettings", {
      ...settings,
      shopifySettingsV2: {
        ...settings.shopifySettingsV2,
        stores: newStores,
      },
    });
    this.shopifyAccessToken = tokenData.access_token;
    this.client = adminApiClient.createAdminApiClient({
      storeDomain: `${this.shopifyStoreName}.myshopify.com`,
      apiVersion: this.apiVersion,
      accessToken: this.shopifyAccessToken,
    });
    log.info(`[Shopify] Token refresh complete`);
  }
  /**
   * 리소스 사용량 스냅샷 생성 (메모리, CPU)
   * 테스트/벤치마크용 - 성능 측정 시 사용 (현재 미사용)
   */
  // @ts-ignore 벤치마크용 예비 메서드
  getResourceSnapshot() {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    return {
      memory: {
        heapUsed: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
        // MB
        heapTotal: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
        // MB
        rss: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
        // MB (실제 물리 메모리)
        external: Math.round((mem.external / 1024 / 1024) * 100) / 100,
        // MB (C++ 객체 등)
      },
      cpu: {
        user: Math.round(cpu.user / 1e3),
        // ms (사용자 모드)
        system: Math.round(cpu.system / 1e3),
        // ms (시스템 모드)
      },
      timestamp: Date.now(),
    };
  }
  /*
     * 리소스 사용량 비교 로그 출력 (성능 측정용, 현재 미사용)
     * 필요시 주석 해제하여 사용
     *
    private logResourceUsage(
      label: string,
      before: ReturnType<typeof this.getResourceSnapshot>,
      after: ReturnType<typeof this.getResourceSnapshot>,
      itemCount?: number
    ): void {
      const duration = after.timestamp - before.timestamp;
      const memDiff = after.memory.heapUsed - before.memory.heapUsed;
      const cpuUserDiff = after.cpu.user - before.cpu.user;
      const cpuSystemDiff = after.cpu.system - before.cpu.system;
  
      log.info(`[리소스 모니터] ========== ${label} ==========`);
      log.info(`[리소스 모니터] 처리 항목: ${itemCount ?? 'N/A'}개`);
      log.info(`[리소스 모니터] 소요 시간: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
      log.info(`[리소스 모니터] 메모리 (Heap Used): ${before.memory.heapUsed}MB → ${after.memory.heapUsed}MB (${memDiff >= 0 ? '+' : ''}${memDiff.toFixed(2)}MB)`);
      log.info(`[리소스 모니터] 메모리 (Heap Total): ${before.memory.heapTotal}MB → ${after.memory.heapTotal}MB`);
      log.info(`[리소스 모니터] 메모리 (RSS): ${before.memory.rss}MB → ${after.memory.rss}MB`);
      log.info(`[리소스 모니터] 메모리 (External): ${before.memory.external}MB → ${after.memory.external}MB`);
      log.info(`[리소스 모니터] CPU (User): +${cpuUserDiff}ms`);
      log.info(`[리소스 모니터] CPU (System): +${cpuSystemDiff}ms`);
      if (itemCount && itemCount > 0) {
        log.info(`[리소스 모니터] 항목당 메모리: ${(memDiff / itemCount).toFixed(4)}MB`);
        log.info(`[리소스 모니터] 항목당 시간: ${(duration / itemCount).toFixed(2)}ms`);
      }
      log.info(`[리소스 모니터] =====================================`);
    }
    */
  /**
   * HTML 특수문자 이스케이프 (XSS 방지)
   */
  escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  /**
   * 상품 설명 HTML 생성 (JSDOM 없이 문자열 템플릿 사용)
   * - aboutThis: Amazon 상품 특징 배열
   * - overview: Amazon 상품 개요 배열
   */
  buildDescriptionHTML(aboutThis, overview) {
    let html = "";
    if (aboutThis && aboutThis.length > 0) {
      html += "<h1>About This</h1><ul>";
      html += aboutThis.map((e) => `<li>${this.escapeHtml(e)}</li>`).join("");
      html += "</ul>";
    }
    if (overview && overview.length > 0) {
      html += "<h1>Overview</h1><ul>";
      html += overview.map((e) => `<li>${this.escapeHtml(e)}</li>`).join("");
      html += "</ul>";
    }
    return `<div>${html}</div>`;
  }
  buildEnhancedDescriptionHTML(aboutThis, overview, descriptionText, specifications) {
    let html = "";

    // Key Features (aboutThis)
    if (aboutThis && aboutThis.length > 0) {
      html += '<div class="sfx-features"><h3>Key Features</h3><ul>';
      for (const item of aboutThis) {
        let text = this.escapeHtml(item);
        // 헤더:본문 패턴 감지
        const m = text.match(/^([^:]{3,50}?)\s*:\s*(.{20,})$/);
        if (m) {
          html += `<li><strong>${m[1]}</strong> — ${m[2]}</li>`;
        } else {
          html += `<li>${text}</li>`;
        }
      }
      html += "</ul></div>";
    }

    // Overview (specs table)
    if (overview && overview.length > 0) {
      html += '<div class="sfx-overview"><h3>Product Overview</h3><table>';
      for (const item of overview) {
        const parts = item.split(" : ");
        if (parts.length === 2) {
          html += `<tr><td><strong>${this.escapeHtml(parts[0].trim())}</strong></td><td>${this.escapeHtml(parts[1].trim())}</td></tr>`;
        } else {
          html += `<tr><td colspan="2">${this.escapeHtml(item)}</td></tr>`;
        }
      }
      html += "</table></div>";
    }

    // Description
    if (descriptionText && descriptionText.trim().length > 20) {
      let desc = descriptionText.trim()
        .replace(/About this item\s*/i, "")
        .replace(/See more product details\s*$/i, "")
        .trim();
      if (desc) {
        const paragraphs = desc.split(/\n{2,}/).filter((p) => p.trim().length >= 15);
        if (paragraphs.length > 0) {
          html += '<div class="sfx-description"><h3>Description</h3>';
          html += paragraphs.map((p) => `<p>${this.escapeHtml(p.trim())}</p>`).join("");
          html += "</div>";
        }
      }
    }

    // Specifications
    if (specifications && typeof specifications === "object") {
      const skipKeys = new Set([
        "asin", "date first available", "date first listed on amazon",
        "customer reviews", "best sellers rank", "best seller rank",
        "manufacturer", "is discontinued by manufacturer",
      ]);
      const rows = Object.entries(specifications)
        .filter(([k, v]) => !skipKeys.has(k.toLowerCase()) && v && String(v).trim())
        .map(([k, v]) => `<tr><td><strong>${this.escapeHtml(k)}</strong></td><td>${this.escapeHtml(String(v))}</td></tr>`);
      if (rows.length > 0) {
        html += '<div class="sfx-specs"><h3>Specifications</h3><table class="sfx-spec-table">';
        html += rows.join("");
        html += "</table></div>";
      }
    }

    if (!html) {
      return `<div>${this.buildDescriptionHTML(aboutThis, overview)}</div>`;
    }
    return `<div>${html}</div>`;
  }

  /**
   * ====================================
   * 크롤링 데이터 → Shopify JSONL 변환
   * ====================================
   *
   * Amazon 크롤링 데이터를 Shopify Bulk Operation에서 사용할 수 있는
   * JSONL (JSON Lines) 형식으로 변환합니다.
   *
   * @param {Array} publications - Shopify 판매 채널 목록
   * @param {product[]} uploadData - 크롤링한 상품 데이터 배열
   * @returns {Promise<string>} JSONL 형식 문자열 (줄바꿈으로 구분된 JSON)
   *
   * 변환 작업:
   * 1. Amazon 상품 제목/브랜드/카테고리 → Shopify 상품 필드 매핑
   * 2. Amazon 상품 설명 (aboutThis, overview) → HTML 설명 생성
   * 3. Amazon 이미지 URL → Shopify 미디어 입력 형식 변환
   * 4. ASIN → Shopify handle (URL 경로)
   * 5. 각 상품을 JSON으로 직렬화하고 줄바꿈으로 연결
   *
   * JSONL 형식:
   * ```jsonl
   * {"input": {...}, "media": [...]}
   * {"input": {...}, "media": [...]}
   * {"input": {...}, "media": [...]}
   * ```
   *
   * 사용 예시:
   * ```typescript
   * const publications = await shopify.getPublications();
   * const uploadData = [...]; // 크롤링 데이터
   * const jsonl = await shopify.convertData(publications, uploadData);
   * // jsonl을 파일로 저장 후 Shopify에 업로드
   * ```
   */
  async convertData(_publications, uploadData, locationId) {
    const failedProducts = [];
    const jsonlDatas = await Promise.all(
      uploadData.map(async (data) => {
        try {
          const {
            title,
            asin,
            brand,
            tags,
            category,
            overview,
            aboutThis,
            images,
            price,
            quantity,
            weight,
            weightUnit,
            url,
            // 새로 추가된 필드들
            bsr_ranks,
            rating,
            reviews_count,
            is_prime,
            date_first_available,
            original_price,
            discount_percent,
            description_text,
            specifications,
            seller,
            fulfilled_by,
          } = data;

          const safeTitle =
            title && title.length > 255
              ? title.substring(0, 252) + "..."
              : title;

          // ===== 새 태그 엔진 적용 =====
          const tagEngineInput = {
            title,
            brand,
            price,
            tags, // breadcrumb array
            category_breadcrumb: tags, // tag_engine에서 사용
            aboutThis,
            bullet_points: aboutThis,
            bsr_ranks: bsr_ranks || [],
            rating: rating || 0,
            is_prime: is_prime || false,
            date_first_available: date_first_available || "",
          };
          const generatedTags = generateAllTags(tagEngineInput);

          // ===== 새 가격 엔진 적용 =====
          const priceInput = {
            price,
            tags,
            category_breadcrumb: tags,
          };
          const pricing = calculatePrice(priceInput);

          // ===== 개선된 description HTML =====
          const descriptionHtml = this.buildEnhancedDescriptionHTML(
            aboutThis,
            overview,
            description_text,
            specifications,
          );

          let processedCategory = category;
          if (category && category.trim()) {
            processedCategory = category.trim().replace(/\s+/g, " ");
            processedCategory = processedCategory.replace(/[^\w\s-]/g, "");
          } else {
            processedCategory = "General";
          }

          let weightInGrams;
          if (weight && weightUnit) {
            if (weightUnit === "kg") {
              weightInGrams = Math.round(weight * 1e3);
            } else if (weightUnit === "lb") {
              weightInGrams = Math.round(weight * 453.592);
            } else if (weightUnit === "oz") {
              weightInGrams = Math.round(weight * 28.3495);
            }
          }

          // specs에서 무게 추출 (weight가 없을 때)
          if (!weightInGrams && specifications) {
            for (const key of ["Item Weight", "Weight", "Package Weight"]) {
              if (specifications[key]) {
                const wm = specifications[key].match(/([\d.]+)\s*(lb|oz|kg|g)\b/i);
                if (wm) {
                  const val = parseFloat(wm[1]);
                  const unit = wm[2].toLowerCase();
                  if (unit === "lb") weightInGrams = Math.round(val * 453.592);
                  else if (unit === "oz") weightInGrams = Math.round(val * 28.3495);
                  else if (unit === "kg") weightInGrams = Math.round(val * 1000);
                  else if (unit === "g") weightInGrams = Math.round(val);
                  break;
                }
              }
            }
          }

          const productOptions = [
            { name: "Title", position: 1, values: [{ name: "Default Title" }] },
          ];

          const variants = [
            {
              optionValues: [{ optionName: "Title", name: "Default Title" }],
              price: pricing.price.toString(),
              compareAtPrice: pricing.compare_at_price > pricing.price
                ? pricing.compare_at_price.toString()
                : undefined,
              sku: asin,
              inventoryItem: { tracked: true },
              inventoryQuantities:
                locationId && typeof quantity === "number" && quantity >= 0
                  ? [{ locationId, name: "available", quantity }]
                  : void 0,
              inventoryPolicy: "DENY",
              weight: weightInGrams ? weightInGrams / 1e3 : void 0,
              weightUnit: weightInGrams ? "KILOGRAMS" : void 0,
            },
          ];

          const matchedRule = this.chooseRule(category || "", tags || []);
          const shopifyTaxonomyId = matchedRule?.taxonomyId;

          const inputData = {
            handle: asin,
            title: safeTitle,
            vendor: brand,
            productType: processedCategory,
            category: shopifyTaxonomyId
              ? `gid://shopify/TaxonomyCategory/${shopifyTaxonomyId}`
              : void 0,
            tags: generatedTags,
            status: "ACTIVE",
            descriptionHtml,
            metafields: [
              ...(url
                ? [{ namespace: "amazon", key: "source_url", type: "url", value: url }]
                : []),
              { namespace: "amazon", key: "asin", type: "single_line_text_field", value: asin || "" },
              { namespace: "amazon", key: "original_price", type: "number_decimal", value: String(price || 0) },
              { namespace: "amazon", key: "seller", type: "single_line_text_field", value: seller || "" },
              { namespace: "amazon", key: "fulfilled_by", type: "single_line_text_field", value: fulfilled_by || "" },
              { namespace: "amazon", key: "rating", type: "number_decimal", value: String(rating || 0) },
              { namespace: "amazon", key: "reviews_count", type: "number_integer", value: String(reviews_count || 0) },
              { namespace: "amazon", key: "margin_percent", type: "number_integer", value: String(pricing.margin_percent) },
              { namespace: "amazon", key: "cost_per_item", type: "number_decimal", value: String(pricing.cost_per_item) },
            ],
            productOptions,
            variants,
          };

          const fileInputs = (images || [])
            .map((image) => {
              const mainImgKeys = Object.keys(image.main || {});
              const lastMainImageUrl = mainImgKeys[mainImgKeys.length - 1];
              return {
                originalSource: lastMainImageUrl,
              };
            })
            .filter((f) => f.originalSource);

          const jsonl = {
            input: {
              ...inputData,
              files: fileInputs.length > 0 ? fileInputs : void 0,
            },
          };
          return JSON.stringify(jsonl);
        } catch (error) {
          const asin = data?.asin || "unknown";
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          log.error(`[convertData] 상품 변환 실패 (${asin}): ${errorMessage}`);
          failedProducts.push({ asin, error: errorMessage });
          return null;
        }
      }),
    );
    const validJsonlDatas = jsonlDatas.filter((item) => item !== null);
    return {
      jsonl: validJsonlDatas.join("\n"),
      failed: failedProducts,
    };
  }

  /**
   * ====================================
   * 공유 데이터 준비 (Static 메서드)
   * ====================================
   *
   * 다중 업로드 시 데이터를 한 번만 로드하여 모든 스토어에서 공유합니다.
   * 메모리 사용량 3배 감소, 로딩 시간 1/3 감소 효과.
   *
   * @param storageId - 크롤링 데이터 스토리지 ID
   * @returns PreparedDataResult - 배치 데이터 + 통계
   */
  static async prepareSharedData(storageId) {
    log.info(`[prepareSharedData] Start - storageId: ${storageId}`);
    const dsStorage = await Crawler.DataSetOpen(storageId);
    const kvStorage = await Crawler.KeyValueStoreOpen(storageId);
    const deselected = (await kvStorage.getValue("deselected")) || [];
    log.info(`[prepareSharedData] Deselected list: ${deselected.length}`);
    log.info(`[prepareSharedData] Loading data...`);
    const allDataset = await dsStorage.getData();
    log.info(
      `[prepareSharedData] Data loaded: ${allDataset?.items?.length || 0} items`,
    );
    if (!allDataset?.items || !Array.isArray(allDataset.items)) {
      log.error(`[prepareSharedData] Dataset empty or corrupted: ${storageId}`);
      return {
        batches: [],
        stats: {
          totalItems: 0,
          noAsin: 0,
          localDuplicate: 0,
          shopifyDuplicate: 0,
          excluded: 0,
          uploaded: 0,
        },
        deselected,
      };
    }
    let skippedNoAsin = 0;
    const validData = allDataset.items.filter((e) => {
      if (!e.asin) {
        skippedNoAsin++;
        return false;
      }
      if (deselected.includes(e.asin)) return false;
      return true;
    });
    const seenAsins = /* @__PURE__ */ new Set();
    let skippedDuplicate = 0;
    const uniqueData = validData.filter((e) => {
      if (seenAsins.has(e.asin)) {
        skippedDuplicate++;
        log.warn(`[Skip] Duplicate ASIN: ${e.asin}`);
        return false;
      }
      seenAsins.add(e.asin);
      return true;
    });
    const stats = {
      totalItems: allDataset.items.length,
      noAsin: skippedNoAsin,
      localDuplicate: skippedDuplicate,
      shopifyDuplicate: 0,
      // 스토어별로 다름 - 각 인스턴스에서 처리
      excluded: deselected.length,
      uploaded: uniqueData.length,
    };
    log.info(
      `[prepareSharedData] Ready: ${uniqueData.length}/${allDataset.items.length} (noASIN: ${skippedNoAsin}, localDup: ${skippedDuplicate}, excluded: ${deselected.length})`,
    );
    const BATCH_SIZE = 2500;
    const batches = [];
    const totalBatches = Math.ceil(uniqueData.length / BATCH_SIZE);
    const total = uniqueData.length;
    for (let i = 0; i < uniqueData.length; i += BATCH_SIZE) {
      const batch = uniqueData.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const processedSoFar = Math.min(i + batch.length, total);
      batches.push({ batch, batchNum, totalBatches, processedSoFar, total });
    }
    return { batches, stats, deselected };
  }
  /**
   * 공유 데이터 주입 (다중 업로드 시 사용)
   */
  setPreparedData(data) {
    this.sharedPreparedData = data;
  }
  /**
   * ====================================
   * 업로드 데이터 준비 (Generator 함수)
   * ====================================
   *
   * Crawler Dataset에서 상품 데이터를 2500개 단위로 읽어오는 Generator입니다.
   * 대량 데이터를 한 번에 메모리에 올리지 않고, 청크 단위로 처리합니다.
   *
   * @yields {product[]} 5000개 단위의 상품 데이터 배열
   *
   * 동작 과정:
   * 1. Crawler의 Dataset과 KeyValueStore 열기
   * 2. KeyValueStore에서 'deselected' (제외할 ASIN 목록) 읽기
   * 3. 5000개씩 Dataset에서 데이터 읽기
   * 4. deselected 목록에 없는 상품만 필터링
   * 5. yield로 청크 반환
   * 6. 더 이상 데이터가 없을 때까지 반복
   *
   * 사용 예시:
   * ```typescript
   * for await (const uploadData of shopify.prepareData()) {
   *   console.log(`처리할 상품 수: ${uploadData.length}`);
   *   // JSONL 변환 및 업로드 처리
   * }
   * ```
   *
   * 2500개 제한 이유:
   * - Shopify Bulk Operation의 권장 배치 크기
   * - 메모리 효율적인 처리
   * - GraphQL Mutation 타임아웃 방지
   */
  async *prepareData() {
    log.info(`[prepareData] Start - storageId: ${this.storageId}`);
    if (this.sharedPreparedData) {
      log.info(`[prepareData] Using shared prepared data`);
      const {
        batches,
        stats,
        deselected: deselected2,
      } = this.sharedPreparedData;
      const existingHandles2 =
        this.cachedExistingHandles || /* @__PURE__ */ new Set();
      let skippedExisting2 = 0;
      const filteredBatches = [];
      let totalFiltered = 0;
      for (const batchData of batches) {
        const filteredBatch = batchData.batch.filter((e) => {
          const handle = e.asin.toLowerCase();
          if (existingHandles2.has(handle)) {
            skippedExisting2++;
            return false;
          }
          return true;
        });
        if (filteredBatch.length > 0) {
          totalFiltered += filteredBatch.length;
          filteredBatches.push({
            ...batchData,
            batch: filteredBatch,
          });
        }
      }
      const totalBatches2 = filteredBatches.length;
      let processedSoFar = 0;
      this.lastPrepareStats = {
        totalItems: stats.totalItems,
        noAsin: stats.noAsin,
        localDuplicate: stats.localDuplicate,
        shopifyDuplicate: skippedExisting2,
        excluded: deselected2.length,
        uploaded: totalFiltered,
      };
      if (skippedExisting2 > 0) {
        log.info(
          `[Duplicate] Skipped ${skippedExisting2} products already in Shopify`,
        );
      }
      log.info(
        `[Upload Ready] ${totalFiltered}/${stats.totalItems} to upload (shopifyDup: ${skippedExisting2})`,
      );
      if (totalFiltered === 0) {
        return;
      }
      for (let i = 0; i < filteredBatches.length; i++) {
        const batchData = filteredBatches[i];
        processedSoFar += batchData.batch.length;
        log.info(
          `[Batch ${i + 1}/${totalBatches2}] Starting ${batchData.batch.length} items`,
        );
        yield {
          batch: batchData.batch,
          batchNum: i + 1,
          totalBatches: totalBatches2,
          processedSoFar,
          total: totalFiltered,
        };
      }
      return;
    }
    const dsStorage = await Crawler.DataSetOpen(this.storageId);
    log.info(`[prepareData] DataSet opened`);
    const kvStorage = await Crawler.KeyValueStoreOpen(this.storageId);
    log.info(`[prepareData] KeyValueStore opened`);
    const deselected = (await kvStorage.getValue("deselected")) || [];
    log.info(`[prepareData] Deselected list loaded: ${deselected.length}`);
    log.info(`[prepareData] Loading data...`);
    const allDataset = await dsStorage.getData();
    log.info(
      `[prepareData] Data loaded: ${allDataset?.items?.length || 0} items`,
    );
    if (!allDataset?.items || !Array.isArray(allDataset.items)) {
      log.error(`[prepareData] Dataset empty or corrupted: ${this.storageId}`);
      return;
    }
    let skippedNoAsin = 0;
    const validData = allDataset.items.filter((e) => {
      if (!e.asin) {
        skippedNoAsin++;
        log.warn(
          `[Skip] No ASIN: ${e.title?.substring(0, 50) || "(no title)"}`,
        );
        return false;
      }
      if (deselected.includes(e.asin)) return false;
      return true;
    });
    const seenAsins = /* @__PURE__ */ new Set();
    let skippedDuplicate = 0;
    const uniqueData = validData.filter((e) => {
      if (seenAsins.has(e.asin)) {
        skippedDuplicate++;
        log.warn(`[Skip] Duplicate ASIN: ${e.asin}`);
        return false;
      }
      seenAsins.add(e.asin);
      return true;
    });
    const existingHandles =
      this.cachedExistingHandles || /* @__PURE__ */ new Set();
    let skippedExisting = 0;
    const newData = uniqueData.filter((e) => {
      const handle = e.asin.toLowerCase();
      if (existingHandles.has(handle)) {
        skippedExisting++;
        return false;
      }
      return true;
    });
    if (skippedExisting > 0) {
      log.info(
        `[Duplicate] Skipped ${skippedExisting} products already in Shopify`,
      );
    }
    log.info(
      `[Upload Ready] ${newData.length}/${allDataset.items.length} to upload (noASIN: ${skippedNoAsin}, localDup: ${skippedDuplicate}, shopifyDup: ${skippedExisting}, excluded: ${deselected.length})`,
    );
    this.lastPrepareStats = {
      totalItems: allDataset.items.length,
      noAsin: skippedNoAsin,
      localDuplicate: skippedDuplicate,
      shopifyDuplicate: skippedExisting,
      excluded: deselected.length,
      uploaded: newData.length,
    };
    if (newData.length === 0) {
      return;
    }
    const BATCH_SIZE = 2500;
    const totalBatches = Math.ceil(newData.length / BATCH_SIZE);
    const total = newData.length;
    for (let i = 0; i < newData.length; i += BATCH_SIZE) {
      const batch = newData.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const processedSoFar = Math.min(i + batch.length, total);
      log.info(
        `[Batch ${batchNum}/${totalBatches}] Starting ${batch.length} items`,
      );
      yield { batch, batchNum, totalBatches, processedSoFar, total };
    }
  }
  /**
   * ====================================
   * Shopify 업로드 메인 함수
   * ====================================
   *
   * 크롤링한 Amazon 상품 데이터를 Shopify 스토어에 자동 업로드하는 메인 함수입니다.
   * Bulk Operation API를 사용하여 대량의 상품을 효율적으로 업로드합니다.
   *
   * @returns {Promise<boolean>} 업로드 성공 여부 (true: 성공, false: 실패)
   *
   * 전체 프로세스:
   * 1. API 권한 검증 (write_products, write_inventory 등)
   * 2. 재고 위치 및 컬렉션 캐시 로드
   * 3. Shopify 판매 채널 정보 조회
   * 4. 크롤링 데이터 2500개씩 읽기 (Generator)
   * 5. JSONL 형식으로 변환
   * 6. Shopify Staged Upload로 파일 업로드
   * 7. Bulk Operation Mutation 실행
   * 8. 폴링으로 작업 완료 대기
   * 9. 완료된 상품의 가격/재고/무게 자동 업데이트
   * 10. 렌더러 프로세스에 완료 알림 전송
   *
   * Bulk Operation 흐름:
   * ```
   * JSONL 생성 → Staged Upload → Bulk Mutation → 폴링 → 가격/재고 업데이트
   * ```
   *
   * 에러 처리:
   * - missingScopes: API 권한 부족 시 업로드 중단
   * - jsonl upload error: 파일 업로드 실패
   * - 기타 에러: 로그 기록 후 false 반환
   *
   * 사용 예시:
   * ```typescript
   * const shopify = new Shopify('0818_143025');
   * const result = await shopify.upload();
   * if (result.success) {
   *   console.log(`업로드 완료: ${result.totalSuccess}개 성공`);
   * } else {
   *   console.error(`업로드 실패: ${result.totalFailed}개 실패`);
   * }
   * ```
   */
  async upload() {
    try {
      await this.ensureValidToken();
      const missingScopes = await this.checkAccessScopes();
      if (missingScopes.length > 0) {
        throw new Error("missingScopes");
      }
      const runningOp = await this.getRunningBulkOperation();
      if (
        runningOp &&
        (runningOp.status === BulkOperationStatus.Running ||
          runningOp.status === BulkOperationStatus.Created)
      ) {
        log.warn(
          `[Wait] Running bulk operation: ${runningOp.id} (${runningOp.status})`,
        );
        await this.pollingCurrentBulkOperation(runningOp.id);
        log.info("[Wait] Previous bulk operation done, starting upload");
      }
      if (!this.cachedLocations || this.cachedLocations.length === 0) {
        await this.loadAllLocations();
      }
      const locationId = await this.createOrGetLocation();
      log.info(`Using location ID for inventory: ${locationId}`);
      await this.loadAllCollections();
      await this.loadExistingHandles();
      await this.loadCategoryMapping();
      log.info(`[Upload] Fetching publications...`);
      const publications = await this.getPublications();
      log.info(`[Upload] Publications loaded: ${publications.length}`);
      const prepareData = this.prepareData();
      let totalSuccess = 0;
      let totalFailed = 0;
      const failedBatches = [];
      for await (const {
        batch: uploadData,
        batchNum,
        totalBatches,
        processedSoFar,
        total,
      } of prepareData) {
        try {
          if (this.dailyLimitReached) {
            log.warn(
              `[Batch ${batchNum}/${totalBatches}] 일일 제한으로 스킵 (${uploadData.length}개)`,
            );
            this.dailyLimitSkipped += uploadData.length;
            totalFailed += uploadData.length;
            continue;
          }
          const prevProcessed = processedSoFar - uploadData.length;
          if (this.onProgress) {
            this.onProgress({
              batchNum,
              totalBatches,
              processed: prevProcessed,
              total,
              percent: Math.round((prevProcessed / total) * 100),
              status: "starting",
            });
          }
          await this.ensureValidToken();
          const runningOpBefore = await this.getRunningBulkOperation();
          if (
            runningOpBefore &&
            (runningOpBefore.status === BulkOperationStatus.Running ||
              runningOpBefore.status === BulkOperationStatus.Created)
          ) {
            log.warn(
              `[Batch ${batchNum}] 이전 Bulk Operation 진행 중 (${runningOpBefore.id}) - 완료 대기...`,
            );
            await this.pollingCurrentBulkOperation(runningOpBefore.id);
            log.info(`[Batch ${batchNum}] 이전 Bulk Operation 완료, 배치 시작`);
          }
          const stagedTarget = await this.stagedUploadsCreate();
          const uploadUrl = stagedTarget.url;
          const parameters = stagedTarget.parameters;
          const fileKey = parameters.find((e) => e.name == "key")?.value;
          const formData = new FormData$1();
          parameters.forEach((param) => {
            formData.append(param.name, param.value);
          });
          const { jsonl: productsJSONL, failed: convertFailedProducts } =
            await this.convertData(publications, uploadData, locationId);
          if (convertFailedProducts.length > 0) {
            log.warn(
              `[Batch ${batchNum}] ${convertFailedProducts.length}개 상품 변환 실패 (스킵됨)`,
            );
            convertFailedProducts.forEach(({ asin, error }) => {
              log.warn(`  - ${asin}: ${error}`);
            });
          }
          if (!productsJSONL || productsJSONL.trim().length === 0) {
            log.warn(`[Batch ${batchNum}] 모든 상품 변환 실패 - 배치 스킵`);
            continue;
          }
          const jsonlBuffer = Buffer.from(productsJSONL, "utf-8");
          formData.append("file", stream.Readable.from(jsonlBuffer), {
            filename: "products.jsonl",
            contentType: "text/jsonl",
            knownLength: jsonlBuffer.length,
            // Content-Length 명시 (S3 호환성)
          });
          const MAX_RETRIES = 3;
          const RETRY_DELAY_MS = 6e4;
          let uploadSuccess = false;
          let lastError = null;
          for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
              let currentFormData;
              if (attempt > 1) {
                currentFormData = new FormData$1();
                parameters.forEach((param) => {
                  currentFormData.append(param.name, param.value);
                });
                currentFormData.append(
                  "file",
                  stream.Readable.from(Buffer.from(productsJSONL, "utf-8")),
                  {
                    filename: "products.jsonl",
                    contentType: "text/jsonl",
                    knownLength: jsonlBuffer.length,
                  },
                );
              } else {
                currentFormData = formData;
              }
              const fetchResponse = await fetch$1(uploadUrl, {
                method: "POST",
                body: currentFormData,
              });
              if (fetchResponse.ok) {
                uploadSuccess = true;
                break;
              } else {
                throw new Error(
                  `HTTP ${fetchResponse.status}: ${fetchResponse.statusText}`,
                );
              }
            } catch (error) {
              lastError =
                error instanceof Error ? error : new Error(String(error));
              const isNetworkError =
                lastError.message.includes("socket hang up") ||
                lastError.message.includes("ECONNRESET") ||
                lastError.message.includes("ETIMEDOUT") ||
                lastError.message.includes("TLS") ||
                lastError.message.includes("fetch failed") ||
                lastError.message.includes("ENOTFOUND") ||
                lastError.message.includes("ECONNREFUSED");
              if (attempt < MAX_RETRIES && isNetworkError) {
                log.warn(
                  `[Batch ${batchNum}] S3 업로드 실패 (${attempt}/${MAX_RETRIES}): ${lastError.message}`,
                );
                log.warn(
                  `[Batch ${batchNum}] ${RETRY_DELAY_MS / 1e3}초 후 재시도...`,
                );
                await new Promise((resolve) =>
                  setTimeout(resolve, RETRY_DELAY_MS),
                );
              } else if (attempt >= MAX_RETRIES) {
                log.error(
                  `[Batch ${batchNum}] S3 업로드 최종 실패: ${lastError.message}`,
                );
                throw lastError;
              } else {
                throw lastError;
              }
            }
          }
          if (uploadSuccess) {
            log.info("Starting bulk operation (productSet)...");
            const bulkOperationRunMutationResult =
              await this.bulkOperationRunMutation(fileKey);
            const bulkOperationId = bulkOperationRunMutationResult.id;
            log.info(`Bulk operation ID: ${bulkOperationId}`);
            log.info(
              "Waiting for bulk operation to complete (includes price/inventory)...",
            );
            await this.pollingCurrentBulkOperation(
              bulkOperationId,
              publications,
            );
            totalSuccess += this.lastBatchSuccess;
            totalFailed += this.lastBatchFailed;
            if (this.dailyLimitReached && this.lastBatchFailed > 0) {
              log.warn(
                `⚠️ Batch ${batchNum}/${totalBatches} 일일 제한 도달 (성공: ${this.lastBatchSuccess}, 실패: ${this.lastBatchFailed})`,
              );
            } else if (this.lastBatchFailed > 0) {
              log.warn(
                `⚠️ Batch ${batchNum}/${totalBatches} 부분 실패 (성공: ${this.lastBatchSuccess}, 실패: ${this.lastBatchFailed})`,
              );
            } else {
              log.info(
                `✅ Batch ${batchNum}/${totalBatches} completed successfully! (${processedSoFar}/${total})`,
              );
            }
            if (this.onProgress) {
              this.onProgress({
                batchNum,
                totalBatches,
                processed: processedSoFar,
                total,
                percent: Math.round((processedSoFar / total) * 100),
                status: "completed",
              });
            }
          } else {
            throw new Error("jsonl upload error");
          }
        } catch (batchError) {
          const errorMessage =
            batchError instanceof Error
              ? batchError.message
              : String(batchError);
          log.error(`❌ Batch ${batchNum} failed: ${errorMessage}`);
          failedBatches.push({ batchNum, error: errorMessage });
          totalFailed += uploadData.length;
          if (this.onProgress) {
            this.onProgress({
              batchNum,
              totalBatches,
              processed: processedSoFar,
              total,
              percent: Math.round((processedSoFar / total) * 100),
              status: "failed",
              error: errorMessage,
            });
          }
          continue;
        }
      }
      log.info("========================================");
      log.info("Upload Complete Result");
      log.info(`   Total Success: ${totalSuccess}`);
      log.info(`   Total Failed: ${totalFailed}`);
      if (this.dailyLimitReached) {
        log.warn(`   ⚠️ 일일 제한 초과: ${this.dailyLimitSkipped}개 스킵됨`);
        log.warn(`   → 24시간 후 다시 시도하세요`);
      }
      if (failedBatches.length > 0) {
        log.warn(
          `   Failed Batches: ${failedBatches.map((b) => `#${b.batchNum}`).join(", ")}`,
        );
      }
      log.info("========================================");
      const toUpload =
        this.lastPrepareStats?.uploaded || totalSuccess + totalFailed;
      if (totalSuccess === 0 && totalFailed > 0) {
        const failedErrors = failedBatches
          .map((b) => b.error)
          .filter((v, i, a) => a.indexOf(v) === i)
          .join("; ");
        throw new Error(`업로드 전체 실패 (${totalFailed}개): ${failedErrors}`);
      }
      if (totalFailed > 0 && totalSuccess > 0) {
        log.warn(
          `[Upload] 부분 실패: ${totalSuccess}개 성공, ${totalFailed}개 실패`,
        );
      }
      const uploadResult = {
        success: totalFailed === 0,
        // 실패 없으면 완전 성공
        totalSuccess,
        totalFailed,
        toUpload,
        failedBatches,
        dailyLimitExceeded: this.dailyLimitReached,
        dailyLimitSkipped: this.dailyLimitSkipped,
      };
      if (this.categoryMismatchLog.length > 0) {
        try {
          const timestamp = /* @__PURE__ */ new Date()
            .toISOString()
            .replace(/[:.]/g, "-")
            .slice(0, 19);
          const logDir = path.join(
            electron.app.getPath("userData"),
            "logs",
            "category_mismatch",
          );
          const { mkdir } = await import("fs/promises");
          await mkdir(logDir, { recursive: true });
          const logPath = path.join(
            logDir,
            `${this.storageId}_${timestamp}.json`,
          );
          const categoryCount = /* @__PURE__ */ new Map();
          this.categoryMismatchLog.forEach((item) => {
            const key = `${item.category}|${item.tags.join(",")}`;
            if (categoryCount.has(key)) {
              categoryCount.get(key).count++;
            } else {
              categoryCount.set(key, { tags: item.tags, count: 1 });
            }
          });
          const summary = Array.from(categoryCount.entries())
            .map(([key, data]) => ({
              category: key.split("|")[0],
              tags: data.tags,
              count: data.count,
            }))
            .sort((a, b) => b.count - a.count);
          await promises.writeFile(
            logPath,
            JSON.stringify(
              {
                storageId: this.storageId,
                timestamp: /* @__PURE__ */ new Date().toISOString(),
                total: this.categoryMismatchLog.length,
                unique: summary.length,
                items: summary,
              },
              null,
              2,
            ),
            "utf-8",
          );
          log.warn(
            `[카테고리 매칭 실패] ${this.categoryMismatchLog.length}개 - 파일: ${logPath}`,
          );
        } catch (error) {
          log.error("Failed to save category mismatch log:", error);
        }
      }
      this.processedUrls.clear();
      this.completedBulkOperations.clear();
      this.categoryMismatchLog = [];
      const stats = this.lastPrepareStats;
      if (stats && stats.uploaded === 0) {
        const message = `업로드할 상품이 없습니다. (전체: ${stats.totalItems}개, 중복: ${stats.shopifyDuplicate}개, 제외: ${stats.excluded}개)`;
        log.info(`[Upload] ${message}`);
        sendToRenderer("shopify:uploadComplete", {
          success: true,
          message,
          noItemsToUpload: true,
          stats,
        });
      } else if (stats) {
        const skipped =
          stats.shopifyDuplicate + stats.localDuplicate + stats.noAsin;
        const message = `업로드 완료: ${stats.uploaded}개 성공${skipped > 0 ? ` (중복/스킵: ${skipped}개)` : ""}`;
        log.info(`[Upload] ${message}`);
        sendToRenderer("shopify:uploadComplete", {
          success: true,
          message,
          stats,
        });
      } else {
        sendToRenderer("shopify:uploadComplete", {
          success: true,
          message: "업로드 완료",
        });
      }
      return uploadResult;
    } catch (error) {
      if (error instanceof Error) {
        log.error("upload fail : ", error.message);
        log.error("upload fail detail : ", error);
      } else {
        log.error("upload fail : ", error);
      }
      throw error;
    }
  }
  async stagedUploadsCreate(filename = "productsJSONL") {
    const op = `#graphql
    mutation stagedUploadsCreate($filename: String!) {
      stagedUploadsCreate(input: {
      resource: BULK_MUTATION_VARIABLES,
      filename: $filename,
      mimeType: "text/jsonl",
      httpMethod: POST
    }) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
      }
    }`;
    const { errors, data } = await this.client.request(op, {
      variables: {
        filename,
      },
    });
    if (errors) throw new Error(errors.message);
    if (!data) throw new Error("data is not found");
    const stagedTargets = data.stagedUploadsCreate?.stagedTargets;
    if (!stagedTargets || stagedTargets?.length === 0)
      throw new Error("stagedTargets is not found");
    const stagedTarget = stagedTargets[0];
    return stagedTarget;
  }
  async bulkOperationRunMutation(stagedUploadPath) {
    const mutationDoc = `#graphql
      mutation call($input: ProductSetInput!) {
        productSet(input: $input) {
          product { id handle title }
          userErrors { field message code }
        }
      }
    `;
    const op = `#graphql
    mutation bulkOperationRunMutation($mutation: String!, $stagedUploadPath: String!){
      bulkOperationRunMutation(
        mutation: $mutation,
        stagedUploadPath: $stagedUploadPath
      ) {
        bulkOperation {
          id
          url
          status
        }
        userErrors {
          message
          field
        }
      }
    }
    `;
    const MAX_RETRIES = 3;
    const THROTTLE_DELAY_MS = 12e4;
    const NETWORK_RETRY_DELAY_MS = 1e4;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      let errors = null;
      let data = null;
      try {
        const result = await this.client.request(op, {
          variables: {
            mutation: mutationDoc,
            stagedUploadPath,
          },
        });
        errors = result.errors;
        data = result.data;
      } catch (networkError) {
        const errMsg =
          networkError instanceof Error
            ? networkError.message
            : String(networkError);
        const isNetworkError =
          errMsg.includes("socket hang up") ||
          errMsg.includes("ECONNRESET") ||
          errMsg.includes("ETIMEDOUT") ||
          errMsg.includes("TLS") ||
          errMsg.includes("fetch failed") ||
          errMsg.includes("ENOTFOUND") ||
          errMsg.includes("ECONNREFUSED");
        if (isNetworkError && attempt < MAX_RETRIES) {
          log.warn(
            `[bulkOperationRunMutation] Network error (${attempt}/${MAX_RETRIES}): ${errMsg}`,
          );
          log.warn(
            `[bulkOperationRunMutation] Retrying in ${NETWORK_RETRY_DELAY_MS / 1e3}s...`,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, NETWORK_RETRY_DELAY_MS),
          );
          continue;
        }
        throw networkError;
      }
      const errorsObj = errors;
      const isThrottled =
        errorsObj?.message?.includes("THROTTLED") ||
        errorsObj?.message?.includes("Throttled") ||
        JSON.stringify(errors)?.includes("THROTTLED");
      if (isThrottled && attempt < MAX_RETRIES) {
        log.warn(
          `[THROTTLED] API rate limited (${attempt}/${MAX_RETRIES}). Retrying in ${THROTTLE_DELAY_MS / 1e3}s...`,
        );
        await new Promise((resolve) => setTimeout(resolve, THROTTLE_DELAY_MS));
        continue;
      }
      if (errors) {
        log.error("Errors details:", JSON.stringify(errors, null, 2));
        throw new Error(errorsObj?.message || "Unknown error");
      }
      if (!data) throw new Error("data is not found");
      let bulkOperation = null;
      if (data.bulkOperationRunMutation?.bulkOperation) {
        bulkOperation = data.bulkOperationRunMutation.bulkOperation;
      } else if (
        data.bulkOperationRunMutation?.bulkOperationRunMutation?.bulkOperation
      ) {
        bulkOperation =
          data.bulkOperationRunMutation.bulkOperationRunMutation.bulkOperation;
      } else if (data.bulkOperation) {
        bulkOperation = data.bulkOperation;
      } else if (data.data?.bulkOperation) {
        bulkOperation = data.data.bulkOperation;
      } else if (data.bulkOperationRunMutation?.userErrors?.length > 0) {
        const userErrors = data.bulkOperationRunMutation.userErrors;
        const errorMessage = userErrors.map((e) => e.message).join(", ");
        const isAlreadyInProgress = errorMessage.includes(
          "already in progress",
        );
        if (isAlreadyInProgress && attempt < MAX_RETRIES) {
          log.warn(
            `[bulkOperationRunMutation] Bulk operation already in progress (${attempt}/${MAX_RETRIES})`,
          );
          log.warn(
            "[bulkOperationRunMutation] Waiting for existing operation to complete...",
          );
          const runningOp = await this.getRunningBulkOperation();
          if (runningOp) {
            await this.pollingCurrentBulkOperation(runningOp.id);
            log.info(
              "[bulkOperationRunMutation] Previous operation completed, retrying...",
            );
          } else {
            await new Promise((resolve) => setTimeout(resolve, 1e4));
          }
          continue;
        }
        log.error("User errors found:", userErrors);
        throw new Error(`Bulk operation failed: ${errorMessage}`);
      }
      if (!bulkOperation) {
        if (data.bulkOperationRunMutation) {
          log.error(
            "Available keys in bulkOperationRunMutation:",
            Object.keys(data.bulkOperationRunMutation),
          );
        }
        if (data.errors) {
          log.error("Response errors:", data.errors);
        }
        throw new Error("bulkOperation is not found in response structure");
      }
      return bulkOperation;
    }
    throw new Error("bulkOperationRunMutation failed after all retries");
  }
  async currentBulkOperation(bulkOperationId) {
    const op = `#graphql
      query getBulkOperation($id: ID!) {
        node(id: $id) {
          ... on BulkOperation {
            id
            status
            errorCode
            createdAt
            completedAt
            objectCount
            fileSize
            url
            partialDataUrl
          }
        }
      }
      `;
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 5e3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const { errors, data } = await this.client.request(op, {
          variables: { id: bulkOperationId },
        });
        if (errors) throw new Error(errors.message || "Unknown error");
        if (!data?.node) throw new Error("BulkOperation not found");
        return data.node;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        const isNetworkError =
          errMsg.includes("socket hang up") ||
          errMsg.includes("ECONNRESET") ||
          errMsg.includes("ETIMEDOUT") ||
          errMsg.includes("TLS") ||
          errMsg.includes("fetch failed") ||
          errMsg.includes("ENOTFOUND") ||
          errMsg.includes("ECONNREFUSED");
        if (isNetworkError && attempt < MAX_RETRIES) {
          log.warn(
            `[currentBulkOperation] Network error (${attempt}/${MAX_RETRIES}): ${errMsg}`,
          );
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          continue;
        }
        throw error;
      }
    }
    throw new Error("currentBulkOperation failed after all retries");
  }
  // 현재 진행 중인 bulk operation 체크 (ID 없이) - 네트워크 에러 재시도 포함
  async getRunningBulkOperation() {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 5e3;
    const op = `#graphql
      query currentBulkOperation{
        currentBulkOperation(type: MUTATION) {
          id
          status
        }
      }
      `;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const { errors, data } = await this.client.request(op);
        if (errors) {
          const errMsg = errors.message || String(errors);
          const isNetworkError =
            errMsg.includes("socket hang up") ||
            errMsg.includes("ECONNRESET") ||
            errMsg.includes("ETIMEDOUT") ||
            errMsg.includes("TLS") ||
            errMsg.includes("fetch failed") ||
            errMsg.includes("ENOTFOUND") ||
            errMsg.includes("ECONNREFUSED");
          if (isNetworkError && attempt < MAX_RETRIES) {
            log.warn(
              `[getRunningBulkOperation] Network error (${attempt}/${MAX_RETRIES}): ${errMsg}`,
            );
            log.warn(
              `[getRunningBulkOperation] Retrying in ${RETRY_DELAY_MS / 1e3}s...`,
            );
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
            continue;
          }
          throw new Error(errMsg);
        }
        return data?.currentBulkOperation || null;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        const isNetworkError =
          errMsg.includes("socket hang up") ||
          errMsg.includes("ECONNRESET") ||
          errMsg.includes("ETIMEDOUT") ||
          errMsg.includes("TLS") ||
          errMsg.includes("fetch failed") ||
          errMsg.includes("ENOTFOUND") ||
          errMsg.includes("ECONNREFUSED");
        if (isNetworkError && attempt < MAX_RETRIES) {
          log.warn(
            `[getRunningBulkOperation] Network error (${attempt}/${MAX_RETRIES}): ${errMsg}`,
          );
          log.warn(
            `[getRunningBulkOperation] Retrying in ${RETRY_DELAY_MS / 1e3}s...`,
          );
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          continue;
        }
        throw error;
      }
    }
    return null;
  }
  async loadAllLocations() {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 5e3;
    await this.ensureValidToken();
    const getAllLocationsOp = `#graphql
      query getAllLocations {
        locations(first: 50) {
          nodes {
            id
            name
            isActive
            address {
              countryCode
              city
              province
            }
          }
        }
      }
    `;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const { errors, data } = await this.client.request(getAllLocationsOp);
        if (errors) {
          const errMsg = errors.message || String(errors);
          const isNetworkError =
            errMsg.includes("socket hang up") ||
            errMsg.includes("ECONNRESET") ||
            errMsg.includes("ETIMEDOUT") ||
            errMsg.includes("TLS") ||
            errMsg.includes("fetch failed") ||
            errMsg.includes("ENOTFOUND") ||
            errMsg.includes("ECONNREFUSED");
          if (isNetworkError && attempt < MAX_RETRIES) {
            log.warn(
              `[loadAllLocations] Network error (${attempt}/${MAX_RETRIES}): ${errMsg}`,
            );
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
            continue;
          }
          log.error("Get all locations errors:", errors);
          this.cachedLocations = [];
          return;
        }
        if (data?.locations?.nodes?.length > 0) {
          this.cachedLocations = data.locations.nodes;
        } else {
          this.cachedLocations = [];
        }
        return;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        const isNetworkError =
          errMsg.includes("socket hang up") ||
          errMsg.includes("ECONNRESET") ||
          errMsg.includes("ETIMEDOUT") ||
          errMsg.includes("TLS") ||
          errMsg.includes("fetch failed") ||
          errMsg.includes("ENOTFOUND") ||
          errMsg.includes("ECONNREFUSED");
        if (isNetworkError && attempt < MAX_RETRIES) {
          log.warn(
            `[loadAllLocations] Network error (${attempt}/${MAX_RETRIES}): ${errMsg}`,
          );
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          continue;
        }
        log.error("Error loading all locations:", error);
        this.cachedLocations = [];
        return;
      }
    }
    log.error("loadAllLocations failed after all retries");
    this.cachedLocations = [];
  }
  getCachedLocations() {
    return this.cachedLocations || [];
  }
  async loadAllCollections() {
    try {
      const getAllCollectionsOp = `#graphql
        query getAllCollections {
          collections(first: 250) {
            nodes {
              id
              title
            }
          }
        }
      `;
      const { errors, data } = await this.client.request(getAllCollectionsOp);
      if (errors) {
        log.error("Get all collections errors:", errors);
        this.cachedCollections.clear();
        return;
      }
      if (data?.collections?.nodes?.length > 0) {
        const collections = data.collections.nodes;
        collections.forEach((col) => {
          const normalizedTitle = col.title.toLowerCase().trim();
          this.cachedCollections.set(normalizedTitle, col.id);
        });
      } else {
        this.cachedCollections.clear();
      }
    } catch (error) {
      log.error("Error loading all collections:", error);
      this.cachedCollections.clear();
    }
  }
  /**
   * ====================================
   * Shopify 기존 상품 Handle 로드 (중복 체크용)
   * ====================================
   *
   * Shopify 스토어에 이미 등록된 모든 상품의 Handle을 조회합니다.
   * Handle은 ASIN과 동일하므로, 이미 업로드된 상품을 중복 업로드하지 않도록 필터링에 사용됩니다.
   *
   * 동작:
   * 1. GraphQL 페이지네이션으로 250개씩 조회
   * 2. 모든 Handle을 Set에 저장
   * 3. cachedExistingHandles에 캐시
   *
   * 성능:
   * - 5만개 상품 = 200회 요청 = 약 10-20초
   */
  async loadExistingHandles() {
    try {
      log.info("[DuplicateCheck] Loading existing Shopify handles...");
      const startTime = Date.now();
      this.cachedExistingHandles = /* @__PURE__ */ new Set();
      let hasNextPage = true;
      let cursor = null;
      let totalLoaded = 0;
      while (hasNextPage) {
        const query = `#graphql
          query getProductHandles($cursor: String) {
            products(first: 250, after: $cursor) {
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                handle
              }
            }
          }
        `;
        const { errors, data } = await this.client.request(query, {
          variables: { cursor },
        });
        if (errors) {
          log.error("[DuplicateCheck] Handle query error:", errors);
          break;
        }
        const products = data?.products;
        if (!products) break;
        for (const product2 of products.nodes) {
          if (product2.handle) {
            this.cachedExistingHandles.add(product2.handle.toLowerCase());
          }
        }
        totalLoaded += products.nodes.length;
        hasNextPage = products.pageInfo.hasNextPage;
        cursor = products.pageInfo.endCursor;
        if (totalLoaded % 1e3 === 0) {
          log.info(`[DuplicateCheck] ${totalLoaded} loaded...`);
        }
      }
      const elapsed = ((Date.now() - startTime) / 1e3).toFixed(1);
      log.info(
        `[DuplicateCheck] Done: ${this.cachedExistingHandles.size} existing (${elapsed}s)`,
      );
    } catch (error) {
      log.error("[DuplicateCheck] Failed to load handles:", error);
      this.cachedExistingHandles = /* @__PURE__ */ new Set();
    }
  }
  /**
   * 기존 Handle 캐시 반환 (외부에서 접근용)
   */
  getExistingHandles() {
    return this.cachedExistingHandles || /* @__PURE__ */ new Set();
  }
  /**
   * ====================================
   * 카테고리 매핑 로드 (CSV - 태그 기반)
   * ====================================
   *
   * cleaned_all.csv 파일에서 Amazon 카테고리 → Shopify Taxonomy ID 매핑 정보를 로드합니다.
   * 태그 기반 완전 일치 방식으로 더 정확한 매칭을 수행합니다.
   *
   * CSV 구조:
   * - amazon_category: Amazon 카테고리명 (예: "Laptops", "Appliances")
   * - tag: 태그 (쉼표로 구분, 예: "Appliances,Dishwashers")
   * - shopify_id: Shopify Taxonomy ID (예: "sg-4-17-2-17", "hg-9")
   * - shopify_category: Shopify 카테고리 전체 경로 (참고용)
   *
   * 동작:
   * 1. resources/cleaned_all.csv 파일 읽기
   * 2. CSV 파싱
   * 3. categoryMappingRules 배열에 저장
   *
   * 사용 예시:
   * ```typescript
   * await shopify.loadCategoryMapping();
   * const rule = shopify.chooseRule("Dishwashers", ["Appliances", "Dishwashers"]);
   * // rule.taxonomyId = "hg-11-6-6-1"
   * ```
   */
  async loadCategoryMapping() {
    try {
      const csvPath = path.join(__dirname, "../../resources/cleaned_all.csv");
      log.info(`Loading category mapping from: ${csvPath}`);
      const csvContent = await promises.readFile(csvPath, "utf-8");
      const lines = csvContent.split("\n").filter((line) => line.trim());
      if (lines.length === 0) {
        log.warn("Category mapping CSV is empty");
        return;
      }
      const [_header, ...dataLines] = lines;
      for (const line of dataLines) {
        try {
          const values = this.parseCSVLine(line);
          if (values.length >= 3) {
            const amazonCategory = values[0].trim().toLowerCase();
            const tagString = values[1].trim();
            const shopifyId = values[2].trim();
            if (amazonCategory && shopifyId) {
              const tags = new Set(
                tagString
                  .split(",")
                  .map((t) => t.trim().toLowerCase())
                  .filter(Boolean),
              );
              this.categoryMappingRules.push({
                amazonCategory,
                tags,
                taxonomyId: shopifyId,
              });
            }
          }
        } catch (parseError) {
          log.warn(`Failed to parse CSV line: ${line}`, parseError);
        }
      }
      log.info(
        `Category mapping loaded: ${this.categoryMappingRules.length} rules`,
      );
    } catch (error) {
      log.error("Error loading category mapping:", error);
      this.categoryMappingRules = [];
    }
  }
  /**
   * CSV 라인 파싱 (따옴표 처리 포함)
   *
   * 예시:
   * - 'Laptops,tag,sg-4-17,Category' => ['Laptops', 'tag', 'sg-4-17', 'Category']
   * - '"Air Conditioner Parts & Accessories","Appliances,Parts",hg-8-1,Accessories'
   *   => ['Air Conditioner Parts & Accessories', 'Appliances,Parts', 'hg-8-1', 'Accessories']
   */
  parseCSVLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }
  /**
   * 카테고리 매칭 실패 로그 저장
   */
  categoryMismatchLog = [];
  /**
   * 다단계 카테고리 규칙 선택
   *
   * 1단계: 태그 완전 일치 (가장 정확)
   * 2단계: 카테고리명 일치
   * 3단계: 부분 일치 (안전장치 포함)
   * 4단계: 실패 → null
   *
   * @param prodCategory 상품 카테고리
   * @param prodTags 상품 태그 배열
   * @returns 매칭된 규칙 또는 null
   */
  chooseRule(prodCategory, prodTags) {
    const pTags = new Set(
      (Array.isArray(prodTags) ? prodTags : [])
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    );
    const normalizedCategory = prodCategory.trim().toLowerCase();
    const exactCandidates = this.categoryMappingRules.filter((rule) => {
      if (!rule.tags || rule.tags.size === 0) return false;
      if (rule.tags.size !== pTags.size) return false;
      for (const t of rule.tags) {
        if (!pTags.has(t)) return false;
      }
      return true;
    });
    if (exactCandidates.length > 0) {
      if (exactCandidates.length > 1) {
        log.warn(
          `[태그 매칭] 완전 일치 규칙이 여러 개 발견됨 (${exactCandidates.length}개)`,
        );
      }
      return exactCandidates[0];
    }
    const categoryCandidates = this.categoryMappingRules.filter(
      (rule) => rule.amazonCategory.toLowerCase() === normalizedCategory,
    );
    if (categoryCandidates.length > 0) {
      return categoryCandidates[0];
    }
    const partialCandidates = this.categoryMappingRules.filter((rule) => {
      if (!rule.tags || rule.tags.size === 0) return false;
      if (rule.tags.size < 2) return false;
      for (const t of rule.tags) {
        if (!pTags.has(t)) return false;
      }
      return true;
    });
    if (partialCandidates.length === 1) {
      return partialCandidates[0];
    } else if (partialCandidates.length > 1) {
      log.warn(
        `[부분 매칭 실패] ${prodCategory}: 후보가 ${partialCandidates.length}개로 애매함`,
      );
    }
    this.categoryMismatchLog.push({
      category: prodCategory,
      tags: Array.from(pTags),
    });
    return null;
  }
  /**
   * Bulk Operation 결과에서 발행용 JSONL 생성
   *
   * productSet 결과 JSONL을 파싱하여 성공적으로 생성된 상품만 추출하고,
   * publishablePublish를 위한 JSONL 파일을 생성합니다.
   *
   * @param resultUrl Bulk Operation 결과 JSONL URL
   * @param publicationIds 발행할 publication ID 배열
   * @returns 발행 대상 상품 개수
   */
  async buildPublishJsonlFromResult(resultUrl, publicationIds) {
    try {
      const tempDir = electron.app.getPath("temp");
      const uniqueId = `${Date.now()}_${this.currentStoreIndex}`;
      const resultPath = path.join(
        tempDir,
        `product_set_result_${uniqueId}.jsonl`,
      );
      const publishPath = path.join(tempDir, `publish_${uniqueId}.jsonl`);
      log.info(`Downloading bulk operation result from: ${resultUrl}`);
      const response = await fetch$1(resultUrl);
      if (!response.ok) {
        throw new Error(`Failed to download result: ${response.statusText}`);
      }
      const resultContent = await response.text();
      await promises.writeFile(resultPath, resultContent, "utf-8");
      let createdOK = 0;
      let dupHandles = 0;
      let otherErrors = 0;
      const outStream = fs.createWriteStream(publishPath, {
        encoding: "utf-8",
      });
      const rl = readline.createInterface({
        input: fs.createReadStream(resultPath, { encoding: "utf-8" }),
        crlfDelay: Infinity,
      });
      for await (const line of rl) {
        if (!line.trim()) continue;
        let raw;
        try {
          raw = JSON.parse(line);
        } catch {
          continue;
        }
        const obj = raw?.data ?? raw;
        const userErrors = obj?.productSet?.userErrors || obj?.userErrors || [];
        if (userErrors.length > 0) {
          const isDup = userErrors.some(
            (e) => e.code === "TAKEN" || e.message?.includes("handle"),
          );
          if (isDup) {
            dupHandles++;
          } else {
            otherErrors++;
          }
          continue;
        }
        const product2 = obj?.productSet?.product || obj?.product;
        if (!product2?.id) continue;
        createdOK++;
        const publishRecord = {
          id: product2.id,
          input: publicationIds,
        };
        outStream.write(JSON.stringify(publishRecord) + "\n");
      }
      outStream.end();
      await new Promise((resolve) => outStream.on("finish", resolve));
      log.info(
        `[발행 준비] 성공: ${createdOK}, 중복: ${dupHandles}, 기타 오류: ${otherErrors}`,
      );
      this.lastPublishJsonlPath = publishPath;
      return createdOK;
    } catch (error) {
      log.error("Failed to build publish JSONL:", error);
      throw error;
    }
  }
  /**
   * publishablePublish Bulk Operation 실행
   *
   * @param stagedUploadPath Staged upload 경로
   * @returns Bulk Operation ID
   */
  async runBulkPublish(stagedUploadPath) {
    const mutationDoc = `#graphql
      mutation publish($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) {
          userErrors { field message }
        }
      }
    `;
    const runMutation = `#graphql
      mutation runBulkPublish($mutation: String!, $stagedUploadPath: String!) {
        bulkOperationRunMutation(
          mutation: $mutation
          stagedUploadPath: $stagedUploadPath
        ) {
          bulkOperation { id status }
          userErrors { field message }
        }
      }
    `;
    const { errors, data } = await this.client.request(runMutation, {
      variables: {
        mutation: mutationDoc,
        stagedUploadPath,
      },
    });
    if (errors) {
      log.error("bulkOperationRunMutation(publishablePublish) failed:", errors);
      throw new Error(`Failed to run bulk publish: ${errors.message}`);
    }
    const userErrors = data?.bulkOperationRunMutation?.userErrors || [];
    if (userErrors.length > 0) {
      log.error("bulkOperationRunMutation userErrors:", userErrors);
      throw new Error(
        `Bulk publish mutation errors: ${JSON.stringify(userErrors)}`,
      );
    }
    const bulkOperation = data?.bulkOperationRunMutation?.bulkOperation;
    if (!bulkOperation?.id) {
      throw new Error("No bulk operation ID returned from publishablePublish");
    }
    log.info(`[발행] Bulk Operation 생성: ${bulkOperation.id}`);
    return bulkOperation.id;
  }
  async createOrGetLocation() {
    try {
      if (!this.cachedLocations || this.cachedLocations.length === 0) {
        await this.loadAllLocations();
      }
      if (this.cachedLocations && this.cachedLocations.length > 0) {
        const locations = this.cachedLocations;
        if (this.selectedLocationId) {
          const selectedLocation = locations.find(
            (loc) => loc.id === this.selectedLocationId,
          );
          if (selectedLocation && selectedLocation.isActive) {
            log.info(
              `Use Custom Location: ${selectedLocation.name} (${selectedLocation.id})`,
            );
            return selectedLocation.id;
          } else {
            log.warn(`Not Found Custom Location : ${this.selectedLocationId}`);
          }
        }
        let defaultLocation = null;
        if (!defaultLocation) {
          const activeLocations = locations.filter((loc) => loc.isActive);
          if (activeLocations.length > 0) {
            defaultLocation = activeLocations[0];
          }
        }
        if (!defaultLocation && locations.length > 0) {
          defaultLocation = locations[0];
        }
        if (defaultLocation && defaultLocation.id) {
          return defaultLocation.id;
        }
      }
      const existingCustomLocationOp = `#graphql
        query getExistingCustomLocation {
          locations(query: "Spharmy-app custom Location", first: 1) {
            nodes {
              id
              name
              isActive
            }
          }
        }
      `;
      const { errors: customErrors, data: customData } =
        await this.client.request(existingCustomLocationOp);
      if (!customErrors && customData?.locations?.nodes?.length > 0) {
        const existingLocation = customData.locations.nodes[0];
        if (existingLocation.isActive) {
          return existingLocation.id;
        }
      }
      const locationId = await this.createLocation();
      return locationId;
    } catch (error) {
      log.error("Error in createOrGetLocation:", error);
      try {
        const locationId = await this.createLocation();
        return locationId;
      } catch (fallbackError) {
        log.error("Failed to create fallback location:", fallbackError);
        throw fallbackError;
      }
    }
  }
  async createLocation() {
    try {
      const op = `#graphql
        mutation createLocation {
          locationAdd(input: {name: "Spharmy-app custom Location", address: { countryCode: KR } }) {
            location {
              id
              name
            }
            userErrors {
              message
              field
            }
          }
        }
      `;
      const { errors, data } = await this.client.request(op);
      if (errors) {
        log.error("Create location errors:", errors);
        throw new Error(
          `Create location failed: ${errors.message || "Unknown error"}`,
        );
      }
      if (!data) {
        log.error("Create location: No data returned");
        throw new Error("Create location: No data returned");
      }
      if (data.locationAdd?.userErrors?.length > 0) {
        const userErrors = data.locationAdd.userErrors;
        log.error("Create location user errors:", userErrors);
        throw new Error(
          `Create location user errors: ${userErrors.map((e) => e.message).join(", ")}`,
        );
      }
      const createdLocationId = data.locationAdd?.location?.id;
      if (!createdLocationId) {
        log.error("Create location: No location ID returned");
        throw new Error("Create location: No location ID returned");
      }
      return createdLocationId;
    } catch (error) {
      log.error("Create location failed:", error);
      throw error;
    }
  }
  async getPublications() {
    const op = `#graphql
      query publications {
        publications(first:10) {
          nodes{
            id,
            name
          }
        }
      }
    `;
    const { errors, data } = await this.client.request(op);
    if (errors) throw new Error(errors.message);
    if (!data) throw new Error("data is not found");
    if (data.publications.nodes.length > 0) {
      return data.publications.nodes.map((e) => {
        return { publicationId: e.id };
      });
    } else {
      throw new Error("publications is not found");
    }
  }
  async createOrGetCollection(categoryName) {
    try {
      const normalizedCategoryName = categoryName.toLowerCase().trim();
      if (this.cachedCollections.has(normalizedCategoryName)) {
        const cachedId = this.cachedCollections.get(normalizedCategoryName);
        return cachedId;
      }
      const getAllCollectionsOp = `#graphql
        query getAllCollections {
          collections(first: 250) {
            nodes {
              id
              title
            }
          }
        }
      `;
      const { errors: getAllErrors, data: getAllData } =
        await this.client.request(getAllCollectionsOp);
      if (getAllErrors) {
        log.error("Get all collections errors:", getAllErrors);
        return null;
      }
      if (getAllData?.collections?.nodes?.length > 0) {
        const allCollections = getAllData.collections.nodes;
        let existingCollection = allCollections.find((col) => {
          const match = col.title.toLowerCase() === normalizedCategoryName;
          return match;
        });
        if (existingCollection) {
          this.cachedCollections.set(
            normalizedCategoryName,
            existingCollection.id,
          );
          return existingCollection.id;
        }
        existingCollection = allCollections.find((col) => {
          const includes1 = col.title
            .toLowerCase()
            .includes(normalizedCategoryName);
          const includes2 = normalizedCategoryName.includes(
            col.title.toLowerCase(),
          );
          const match = includes1 || includes2;
          return match;
        });
        if (existingCollection) {
          this.cachedCollections.set(
            normalizedCategoryName,
            existingCollection.id,
          );
          return existingCollection.id;
        }
      }
      const createOp = `#graphql
        mutation collectionCreate($input: CollectionInput!) {
          collectionCreate(input: $input) {
            collection {
              id
              title
            }
            userErrors {
              message
              field
            }
          }
        }
      `;
      const { errors: createErrors, data: createData } =
        await this.client.request(createOp, {
          variables: {
            input: {
              title: categoryName,
              descriptionHtml: `<p>Products in ${categoryName} category</p>`,
            },
          },
        });
      if (createErrors) {
        log.error("Create collection errors:", createErrors);
        return null;
      }
      if (createData?.collectionCreate?.userErrors?.length > 0) {
        log.error(
          "Create collection user errors:",
          createData.collectionCreate.userErrors,
        );
        return null;
      }
      const newCollectionId = createData?.collectionCreate?.collection?.id;
      if (newCollectionId) {
        this.cachedCollections.set(normalizedCategoryName, newCollectionId);
        return newCollectionId;
      } else {
        log.error(
          "Collection created but no ID returned for category:",
          categoryName,
        );
        log.error(
          "Create collection response:",
          JSON.stringify(createData, null, 2),
        );
        return null;
      }
    } catch (error) {
      log.error("Error in createOrGetCollection:", error);
      return null;
    }
  }
  async getAccessScopes() {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 5e3;
    const op = `#graphql
      query getAppInstallation {
        currentAppInstallation {
          accessScopes {
            handle
          }
        }
      }
    `;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const { errors, data } = await this.client.request(op);
        if (errors) {
          const errMsg = errors.message || String(errors);
          const isNetworkError =
            errMsg.includes("socket hang up") ||
            errMsg.includes("ECONNRESET") ||
            errMsg.includes("ETIMEDOUT") ||
            errMsg.includes("TLS") ||
            errMsg.includes("fetch failed") ||
            errMsg.includes("ENOTFOUND") ||
            errMsg.includes("ECONNREFUSED");
          if (isNetworkError && attempt < MAX_RETRIES) {
            log.warn(
              `[getAccessScopes] Network error (${attempt}/${MAX_RETRIES}): ${errMsg}`,
            );
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
            continue;
          }
          throw new Error(errMsg);
        }
        if (!data) throw new Error("data is not found");
        const accessScopes = data.currentAppInstallation.accessScopes;
        return accessScopes.map((e) => e.handle);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        const isNetworkError =
          errMsg.includes("socket hang up") ||
          errMsg.includes("ECONNRESET") ||
          errMsg.includes("ETIMEDOUT") ||
          errMsg.includes("TLS") ||
          errMsg.includes("fetch failed") ||
          errMsg.includes("ENOTFOUND") ||
          errMsg.includes("ECONNREFUSED");
        if (isNetworkError && attempt < MAX_RETRIES) {
          log.warn(
            `[getAccessScopes] Network error (${attempt}/${MAX_RETRIES}): ${errMsg}`,
          );
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          continue;
        }
        throw error;
      }
    }
    throw new Error("getAccessScopes failed after all retries");
  }
  async checkAccessScopes() {
    const requiredScopes = [
      "write_products",
      "write_locations",
      "write_channels",
      "read_products",
      "read_locations",
      "read_channels",
      "write_inventory",
      "read_inventory",
      "write_orders",
      "read_orders",
    ];
    const accessScopes = await this.getAccessScopes();
    const missingScopes = lodash.difference(requiredScopes, accessScopes);
    return missingScopes;
  }
  processedUrls = /* @__PURE__ */ new Set();
  completedBulkOperations = /* @__PURE__ */ new Set();
  async pollingCurrentBulkOperation(bulkOperationId, publicationIds) {
    while (true) {
      try {
        const result = await this.currentBulkOperation(bulkOperationId);
        if (result.status === BulkOperationStatus.Completed) {
          if (!this.completedBulkOperations.has(bulkOperationId)) {
            this.completedBulkOperations.add(bulkOperationId);
            log.info(`Bulk operation completed: ${bulkOperationId}`);
            log.info(
              `Status: ${result.status}, Objects: ${result.objectCount || "N/A"}`,
            );
            await this.logBulkOperationResult(result);
            if (publicationIds && publicationIds.length > 0) {
              await this.executePublishStep(result, publicationIds);
            }
          }
          return;
        }
        if (
          result.status === BulkOperationStatus.Running ||
          result.status === BulkOperationStatus.Created
        ) {
          await new Promise((resolve) => setTimeout(resolve, 3e3));
          continue;
        }
        log.error(`Bulk operation failed with status: ${result.status}`);
        throw new Error(`Bulk operation failed: ${result.status}`);
      } catch (error) {
        log.error(`Error in polling bulk operation ${bulkOperationId}:`, error);
        throw error;
      }
    }
  }
  /**
   * Bulk Operation 결과 분석 및 로그
   */
  async logBulkOperationResult(bulkOpResult) {
    try {
      const resultUrl = bulkOpResult.url || bulkOpResult.partialDataUrl;
      if (!resultUrl) {
        log.warn("[결과] result URL 없음, 결과 분석 스킵");
        return;
      }
      const response = await fetch$1(resultUrl);
      if (!response.ok) {
        log.error(`[결과] 다운로드 실패: ${response.statusText}`);
        return;
      }
      const resultContent = await response.text();
      const lines = resultContent.split("\n").filter((line) => line.trim());
      if (lines.length > 0) {
        try {
          const raw = JSON.parse(lines[0]);
          const obj = raw?.data ?? raw;
          if (obj?.publishablePublish !== void 0) {
            return;
          }
        } catch {}
      }
      let success = 0;
      let failed = 0;
      let hasProductSetResult = false;
      const failedItems = [];
      if (lines.length > 0) {
        log.debug(
          `[결과 JSONL 샘플] 첫 번째 라인: ${lines[0]?.substring(0, 500)}`,
        );
      }
      for (const line of lines) {
        try {
          const raw = JSON.parse(line);
          const obj = raw?.data ?? raw;
          const errors = raw?.errors || [];
          const dailyLimitError = errors.find(
            (e) =>
              e?.extensions?.code === "VARIANT_THROTTLE_EXCEEDED" ||
              e?.message?.includes("Daily variant creation limit"),
          );
          if (dailyLimitError) {
            hasProductSetResult = true;
            failed++;
            this.dailyLimitSkipped++;
            if (!this.dailyLimitReached) {
              this.dailyLimitReached = true;
              log.error(`[일일 제한 도달] ${dailyLimitError.message}`);
            }
            failedItems.push({
              handle: "daily-limit",
              error: dailyLimitError.message,
            });
            continue;
          }
          if (obj?.productSet !== void 0) {
            hasProductSetResult = true;
            const userErrors = obj?.productSet?.userErrors || [];
            if (userErrors.length > 0) {
              failed++;
              const handle =
                obj?.productSet?.product?.handle ||
                raw?.__parent_id ||
                "unknown";
              const errorMsg = userErrors.map((e) => e.message).join("; ");
              if (failed <= 5) {
                log.warn(`[상품 생성 실패] ${handle}: ${errorMsg}`);
              }
              failedItems.push({ handle, error: errorMsg });
            } else if (obj?.productSet?.product?.id) {
              success++;
            } else {
              if (failed + success < 3) {
                log.warn(
                  `[예상치 못한 응답] ${JSON.stringify(obj?.productSet).substring(0, 300)}`,
                );
              }
            }
          } else if (obj?.publishablePublish !== void 0) {
            continue;
          }
        } catch {}
      }
      if (hasProductSetResult) {
        log.info(`[결과] 성공: ${success}개, 실패: ${failed}개`);
        this.lastBatchSuccess = success;
        this.lastBatchFailed = failed;
      }
      if (failedItems.length > 0) {
        const timestamp = /* @__PURE__ */ new Date()
          .toISOString()
          .replace(/[:.]/g, "-")
          .slice(0, 19);
        const uploadErrorsDir = path.join(
          electron.app.getPath("userData"),
          "logs",
          "upload_errors",
        );
        const { mkdir } = await import("fs/promises");
        await mkdir(uploadErrorsDir, { recursive: true });
        const errorFilePath = path.join(
          uploadErrorsDir,
          `${this.storageId}_${timestamp}.json`,
        );
        await promises.writeFile(
          errorFilePath,
          JSON.stringify(
            {
              storageId: this.storageId,
              timestamp: /* @__PURE__ */ new Date().toISOString(),
              success,
              failed,
              items: failedItems,
            },
            null,
            2,
          ),
          "utf-8",
        );
        log.warn(
          `[실패 목록] ${failedItems.length}개 실패 - 파일: ${errorFilePath}`,
        );
      }
    } catch (error) {
      log.error("[결과] 분석 중 에러:", error);
    }
  }
  /**
   * 발행 단계 실행 (publishablePublish)
   *
   * productSet 완료 후 성공한 상품들을 Online Store 등에 발행합니다.
   *
   * @param bulkOpResult productSet Bulk Operation 결과
   * @param publicationIds 발행할 publication ID 배열
   */
  async executePublishStep(bulkOpResult, publicationIds) {
    try {
      const resultUrl = bulkOpResult.url || bulkOpResult.partialDataUrl;
      if (!resultUrl) {
        log.warn("No result URL available, skipping publish step");
        return;
      }
      const runningOp = await this.getRunningBulkOperation();
      if (
        runningOp &&
        (runningOp.status === BulkOperationStatus.Running ||
          runningOp.status === BulkOperationStatus.Created)
      ) {
        log.info(
          `[발행 대기] 이전 bulk operation 완료 대기 중: ${runningOp.id}`,
        );
        await this.pollingCurrentBulkOperation(runningOp.id);
        log.info("[발행 대기] 이전 bulk operation 완료됨");
      }
      log.info("===== 발행 단계 시작 =====");
      const createdCount = await this.buildPublishJsonlFromResult(
        resultUrl,
        publicationIds,
      );
      if (createdCount === 0) {
        log.info("[발행 스킵] 발행 대상 상품 없음 (모두 중복 또는 오류)");
        return;
      }
      if (!this.lastPublishJsonlPath) {
        throw new Error("Publish JSONL path not found");
      }
      const stagedTarget = await this.stagedUploadsCreate();
      const uploadUrl = stagedTarget.url;
      const parameters = stagedTarget.parameters;
      const fileKey = parameters.find((e) => e.name == "key")?.value;
      const formData = new FormData$1();
      parameters.forEach((param) => {
        formData.append(param.name, param.value);
      });
      formData.append("file", fs.createReadStream(this.lastPublishJsonlPath));
      const uploadResponse = await fetch$1(uploadUrl, {
        method: "POST",
        body: formData,
      });
      if (!uploadResponse.ok) {
        throw new Error(
          `Failed to upload publish JSONL: ${uploadResponse.statusText}`,
        );
      }
      log.info("발행 JSONL 업로드 완료");
      const publishOpId = await this.runBulkPublish(fileKey);
      log.info("발행 Bulk Operation 실행 중...");
      await this.pollingCurrentBulkOperation(publishOpId);
      log.info("✅ 발행 완료!");
    } catch (error) {
      log.error("발행 단계 실패:", error);
      log.warn(
        "상품 생성은 완료되었으나 자동 발행에 실패했습니다. 수동으로 발행해주세요.",
      );
    }
  }
  /**
   * @deprecated productSet mutation을 사용하므로 더 이상 필요하지 않음
   * 가격/재고/무게는 이제 상품 생성 시 한 번에 설정됨
   *
   * 하위 호환성을 위해 유지하지만 사용하지 않음
   */
  async updateProductPriceAndInventory(
    productId,
    asin,
    price,
    quantity,
    locationId,
    weightInGrams,
  ) {
    const executeOnce = async (operation) => {
      try {
        return await operation();
      } catch (error) {
        log.error("API call failed, no retry:", error);
        throw error;
      }
    };
    try {
      const getVariantOp = `#graphql
        query getProductVariant($productId: ID!) {
          product(id: $productId) {
            variants(first: 1) {
              nodes {
                id
              }
            }
          }
        }
      `;
      const { errors: variantErrors, data: variantData } = await executeOnce(
        async () => {
          return await this.client.request(getVariantOp, {
            variables: { productId },
          });
        },
      );
      if (variantErrors) {
        log.error("Get variant errors:", variantErrors);
        return false;
      }
      const variantId = variantData?.product?.variants?.nodes?.[0]?.id;
      if (!variantId) {
        log.error("Variant not found for product:", productId);
        return false;
      }
      const updatePriceOp = `#graphql
        mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            userErrors {
              message
              field
            }
          }
        }
      `;
      const { errors: priceErrors, data: priceData } = await executeOnce(
        async () => {
          return await this.client.request(updatePriceOp, {
            variables: {
              productId,
              variants: [
                {
                  id: variantId,
                  price: price.toString(),
                  inventoryItem: {
                    sku: asin,
                    tracked: true,
                    requiresShipping: true,
                  },
                },
              ],
            },
          });
        },
      );
      if (priceErrors) {
        log.error("Update price errors:", priceErrors);
        return false;
      }
      if (priceData?.productVariantsBulkUpdate?.userErrors?.length > 0) {
        log.error(
          "Update price user errors:",
          priceData.productVariantsBulkUpdate.userErrors,
        );
        return false;
      }
      const getInventoryItemOp = `#graphql
        query getProductVariant($productId: ID!) {
          product(id: $productId) {
            variants(first: 1) {
              nodes {
                id
                inventoryItem {
                  id
                }
              }
            }
          }
        }
      `;
      const { errors: getInventoryErrors, data: getInventoryData } =
        await executeOnce(async () => {
          return await this.client.request(getInventoryItemOp, {
            variables: { productId },
          });
        });
      if (getInventoryErrors) {
        log.error("Get inventory item errors:", getInventoryErrors);
      } else {
        const inventoryItemId =
          getInventoryData?.product?.variants?.nodes?.[0]?.inventoryItem?.id;
        if (inventoryItemId) {
          try {
            const activateOp = `#graphql
                mutation inventoryActivate($inventoryItemId: ID!, $locationId: ID!) {
                  inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) {
                    userErrors {
                      message
                      field
                    }
                    inventoryLevel {
                      id
                    }
                  }
                }
              `;
            const { errors: activateErrors, data: activateData } =
              await this.client.request(activateOp, {
                variables: {
                  inventoryItemId,
                  locationId,
                },
              });
            if (
              !activateErrors &&
              !activateData?.inventoryActivate?.userErrors?.length
            ) {
              const newLevelId =
                activateData?.inventoryActivate?.inventoryLevel?.id;
              if (newLevelId) {
                try {
                  const adjustQuantityOp = `#graphql
                      mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
                        inventoryAdjustQuantities(input: $input) {
                          userErrors {
                            message
                            field
                          }
                          inventoryAdjustmentGroup {
                            createdAt
                            reason
                            changes {
                              name
                              delta
                            }
                          }
                        }
                      }
                    `;
                  const checkQuantityOp = `#graphql
                      query checkInventoryQuantity($inventoryLevelId: ID!) {
                        inventoryLevel(id: $inventoryLevelId) {
                          id
                          quantities(names: ["available"]) {
                            name
                            quantity
                          }
                        }
                      }
                    `;
                  const { errors: checkErrors, data: checkData } =
                    await this.client.request(checkQuantityOp, {
                      variables: {
                        inventoryLevelId: newLevelId,
                      },
                    });
                  if (!checkErrors && checkData?.inventoryLevel) {
                    const currentQuantity =
                      checkData.inventoryLevel.quantities?.[0]?.quantity || 0;
                    const delta = quantity - currentQuantity;
                    if (delta !== 0) {
                      const inputData = {
                        reason: "correction",
                        name: "available",
                        changes: [
                          {
                            delta,
                            inventoryItemId,
                            locationId,
                          },
                        ],
                      };
                      const { errors: adjustErrors, data: adjustData } =
                        await this.client.request(adjustQuantityOp, {
                          variables: {
                            input: inputData,
                          },
                        });
                      if (
                        !adjustErrors &&
                        !adjustData?.inventoryAdjustQuantities?.userErrors
                          ?.length
                      ) {
                        return;
                      } else {
                        log.warn(
                          "⚠️ Adjust quantity failed, checking user errors...",
                        );
                        if (
                          adjustData?.inventoryAdjustQuantities?.userErrors
                            ?.length > 0
                        ) {
                          log.error(
                            "User errors:",
                            adjustData.inventoryAdjustQuantities.userErrors,
                          );
                          log.error(
                            "Full response data:",
                            JSON.stringify(adjustData, null, 2),
                          );
                        }
                        throw new Error(
                          "Adjust quantity failed with user errors",
                        );
                      }
                    } else {
                      return;
                    }
                  } else {
                    const inputData = {
                      reason: "correction",
                      name: "available",
                      changes: [
                        {
                          delta: quantity,
                          inventoryItemId,
                          locationId,
                        },
                      ],
                    };
                    const { errors: adjustErrors, data: adjustData } =
                      await this.client.request(adjustQuantityOp, {
                        variables: {
                          input: inputData,
                        },
                      });
                    if (
                      !adjustErrors &&
                      !adjustData?.inventoryAdjustQuantities?.userErrors?.length
                    ) {
                      return;
                    } else {
                      if (
                        adjustData?.inventoryAdjustQuantities?.userErrors
                          ?.length > 0
                      ) {
                        log.error(
                          "User errors:",
                          adjustData.inventoryAdjustQuantities.userErrors,
                        );
                        log.error(
                          "Full response data:",
                          JSON.stringify(adjustData, null, 2),
                        );
                      }
                      throw new Error("Direct adjust quantity failed");
                    }
                  }
                } catch (adjustError) {
                  log.warn("inventoryAdjustQuantities failed:", adjustError);
                }
              } else {
                log.error("New inventory level created but no ID returned");
                throw new Error("No inventory level ID returned from activate");
              }
            } else {
              log.error(
                "Inventory activate failed:",
                activateErrors || activateData?.inventoryActivate?.userErrors,
              );
              throw new Error("Failed to create new inventory level");
            }
          } catch (createError) {
            log.error("Inventory level creation failed:", createError);
            throw createError;
          }
        }
      }
      if (asin) {
        try {
          if (weightInGrams && weightInGrams > 0) {
            const updateWeightOp = `#graphql
              mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
                productVariantsBulkUpdate(productId: $productId, variants: $variants) {
                  userErrors {
                    message
                    field
                  }
                }
              }
            `;
            const weightInput = {
              id: variantId,
              weight: weightInGrams,
              weightUnit: "GRAMS",
            };
            const { errors: weightErrors, data: weightData } =
              await this.client.request(updateWeightOp, {
                variables: {
                  productId,
                  variants: [weightInput],
                },
              });
            if (weightErrors) {
              log.error("Update weight errors:", weightErrors);
            } else if (
              weightData?.productVariantsBulkUpdate?.userErrors?.length > 0
            ) {
              log.error(
                "Update weight user errors:",
                weightData.productVariantsBulkUpdate.userErrors,
              );
            }
          }
        } catch (error) {
          log.error("SKU/Weight update failed with exception:", error);
        }
      }
      return true;
    } catch (error) {
      log.error("Update price and inventory failed:", error);
      return false;
    }
  }
  /**
   * @deprecated productSet mutation을 사용하므로 더 이상 필요하지 않음
   * 가격/재고/무게는 이제 상품 생성 시 한 번에 설정됨
   *
   * 하위 호환성을 위해 유지하지만 사용하지 않음
   */
  async updatePricesAndInventoryFromBulkResult(bulkResultUrl) {
    try {
      const response = await fetch$1(bulkResultUrl);
      const bulkResult = await response.text();
      const lines = bulkResult.split("\n").filter((line) => line.trim());
      const createdProducts = [];
      for (const line of lines) {
        try {
          const result = JSON.parse(line);
          if (result.data?.productCreate?.product) {
            createdProducts.push({
              id: result.data.productCreate.product.id,
              title: result.data.productCreate.product.title,
            });
          }
        } catch (parseError) {
          log.error("Failed to parse bulk result line:", parseError);
        }
      }
      const locationId = await this.createOrGetLocation();
      for (const product2 of createdProducts) {
        const productHandle = await this.getProductHandle(product2.id);
        if (!productHandle) {
          log.error("Failed to get product handle for:", product2.title);
          continue;
        }
        const originalData =
          await this.findOriginalProductDataByAsin(productHandle);
        if (originalData) {
          const finalPrice =
            originalData.price + (originalData.price * this.margin) / 100;
          let weightInGrams;
          if (originalData.weight && originalData.weightUnit) {
            if (originalData.weightUnit === "kg") {
              weightInGrams = Math.round(originalData.weight * 1e3);
            } else if (originalData.weightUnit === "lb") {
              weightInGrams = Math.round(originalData.weight * 453.592);
            } else if (originalData.weightUnit === "oz") {
              weightInGrams = Math.round(originalData.weight * 28.3495);
            } else {
              weightInGrams = Math.round(originalData.weight * 1e3);
            }
          }
          await this.updateProductPriceAndInventory(
            product2.id,
            originalData.asin,
            finalPrice,
            originalData.quantity,
            locationId,
            weightInGrams,
          );
          if (originalData.category && originalData.category.trim()) {
            try {
              const trimmedCategory = originalData.category.trim();
              if (trimmedCategory === "") {
                return;
              }
              const shopifyCategoryId =
                await this.findProductCategoryByName(trimmedCategory);
              if (shopifyCategoryId) {
                try {
                  const updateCategoryOp = `#graphql
                    mutation productUpdate($input: ProductInput!) {
                      productUpdate(input: $input) {
                        product {
                          id
                          title
                          category {
                            id
                            name
                          }
                        }
                        userErrors {
                          message
                          field
                        }
                      }
                    }
                  `;
                  const {
                    errors: categoryUpdateErrors2,
                    data: categoryUpdateData2,
                  } = await this.client.request(updateCategoryOp, {
                    variables: {
                      input: {
                        id: product2.id,
                        category: shopifyCategoryId,
                      },
                    },
                  });
                  if (categoryUpdateErrors2) {
                  } else if (
                    categoryUpdateData2?.productUpdate?.userErrors?.length > 0
                  ) {
                  } else {
                  }
                } catch (error) {}
              } else {
              }
              const collectionId =
                await this.createOrGetCollection(trimmedCategory);
              if (collectionId) {
                const addResult = await this.addProductToCollection(
                  product2.id,
                  collectionId,
                );
                if (!addResult) {
                  log.error(
                    "Failed to add product to collection:",
                    product2.title,
                  );
                }
              } else {
              }
            } catch (error) {
              log.error("Error details:", JSON.stringify(error, null, 2));
            }
          } else {
          }
        } else {
          log.error("Original data not found for ASIN:", productHandle);
        }
      }
    } catch (error) {
      log.error(
        "Failed to update prices and inventory from bulk result:",
        error,
      );
    }
  }
  async getProductHandle(productId) {
    try {
      const getProductOp = `#graphql
        query getProduct($id: ID!) {
          product(id: $id) {
            id
            handle
            title
          }
        }
      `;
      const { errors, data } = await this.client.request(getProductOp, {
        variables: { id: productId },
      });
      if (errors) {
        log.error("Get product handle errors:", errors);
        return null;
      }
      const handle = data?.product?.handle;
      return handle;
    } catch (error) {
      log.error("Error getting product handle:", error);
      return null;
    }
  }
  async findProductCategoryByName(categoryName) {
    let category = "";
    try {
      const result = await getMatchCategory(categoryName);
      log.info(`category result : ${result.data?.shopify_category}`);
      log.info(`category result : ${JSON.stringify(result.data, null, 2)}`);
      if (result.data) {
        category = result.data.shopify_category;
        log.info(`category match: ${category}`);
      }
    } catch (error) {}
    log.info(`category name : ${category}`);
    if (category === "") {
      return null;
    }
    try {
      const searchQuery = `#graphql
        query getTaxonomy($search: String!) {
          taxonomy {
            categories(first: 250, search: $search) {
              nodes {
                id
                name
                fullName
              }
            }
          }
        }
      `;
      const { errors, data } = await this.client.request(searchQuery, {
        variables: { search: category },
      });
      if (!errors && data?.taxonomy?.categories?.nodes) {
        const categories = data.taxonomy.categories.nodes;
        const fullNameMatch = categories.find(
          (cat) => cat.fullName?.toLowerCase() === category.toLowerCase(),
        );
        if (fullNameMatch) {
          log.info(
            `Found exact fullName match: ${fullNameMatch.fullName} (${fullNameMatch.id})`,
          );
          return fullNameMatch.id;
        }
        const nameMatch = categories.find(
          (cat) => cat.name.toLowerCase() === category.toLowerCase(),
        );
        if (nameMatch) {
          log.info(
            `Found exact name match: ${nameMatch.name} (${nameMatch.id})`,
          );
          return nameMatch.id;
        }
        log.warn(`No exact match found for category: ${category}`);
      }
      return null;
    } catch (error) {
      log.error("Error searching product categories:", error);
      return null;
    }
  }
  async findOriginalProductDataByAsin(asin) {
    try {
      const dsStorage = await Crawler.DataSetOpen(this.storageId);
      const allData = await dsStorage.getData({ offset: 0, limit: 1e4 });
      const asinLower = (asin || "").toLowerCase();
      const foundItem = allData.items.find(
        (item) => (item.asin || "").toLowerCase() === asinLower,
      );
      return foundItem;
    } catch (error) {
      log.error("Failed to find original product data by ASIN:", error);
      return null;
    }
  }
  async addProductToCollection(productId, collectionId) {
    try {
      const productStatusOp = `#graphql
        query getProductStatus($id: ID!) {
          product(id: $id) {
            id
            title
            status
            publishedAt
          }
        }
      `;
      const { errors: statusErrors, data: statusData } =
        await this.client.request(productStatusOp, {
          variables: { id: productId },
        });
      if (statusErrors) {
        log.error("Get product status errors:", statusErrors);
      } else {
        const product2 = statusData?.product;
        if (product2?.status === "DRAFT" || !product2?.publishedAt) {
          const publishOp = `#graphql
            mutation productPublish($input: ProductPublishInput!) {
              productPublish(input: $input) {
                product {
                  id
                  status
                  publishedAt
                }
                userErrors {
                  message
                  field
                }
              }
            }
          `;
          const { errors: publishErrors, data: publishData } =
            await this.client.request(publishOp, {
              variables: {
                input: {
                  id: productId,
                  publicationId: "gid://shopify/Publication/125431906563",
                  // 기본 publication ID
                },
              },
            });
          if (publishErrors) {
            log.error("Publish product errors:", publishErrors);
          } else if (publishData?.productPublish?.userErrors?.length > 0) {
            log.error(
              "Publish product user errors:",
              publishData.productPublish.userErrors,
            );
          }
        }
      }
      const addProductOp = `#graphql
        mutation collectionAddProducts($id: ID!, $productIds: [ID!]!) {
          collectionAddProducts(id: $id, productIds: $productIds) {
            collection {
              id
              title
            }
            userErrors {
              message
              field
            }
          }
        }
      `;
      const { errors, data } = await this.client.request(addProductOp, {
        variables: {
          id: collectionId,
          productIds: [productId],
        },
      });
      if (errors) {
        log.error("Add product to collection errors:", errors);
        return false;
      }
      if (data?.collectionAddProducts?.userErrors?.length > 0) {
        const userErrors = data.collectionAddProducts.userErrors;
        for (const error of userErrors) {
          if (
            error.message.includes("already exists") ||
            error.message.includes("already in collection")
          ) {
            return true;
          }
        }
        const alternativeOp = `#graphql
          mutation collectionUpdate($input: CollectionInput!) {
            collectionUpdate(input: $input) {
              collection {
                id
                title
              }
              userErrors {
                message
                field
              }
            }
          }
        `;
        const getCollectionProductsOp = `#graphql
          query getCollectionProducts($id: ID!) {
            collection(id: $id) {
              id
              title
              products(first: 250) {
                nodes {
                  id
                }
              }
            }
          }
        `;
        const { errors: getProductsErrors, data: getProductsData } =
          await this.client.request(getCollectionProductsOp, {
            variables: { id: collectionId },
          });
        if (
          !getProductsErrors &&
          getProductsData?.collection?.products?.nodes
        ) {
          const existingProductIds =
            getProductsData.collection.products.nodes.map((p) => p.id);
          if (existingProductIds.includes(productId)) {
            return true;
          }
          const newProductIds = [...existingProductIds, productId];
          const { errors: updateErrors, data: updateData } =
            await this.client.request(alternativeOp, {
              variables: {
                input: {
                  id: collectionId,
                  products: newProductIds,
                },
              },
            });
          if (updateErrors) {
            log.error("Alternative collection update errors:", updateErrors);
          } else if (updateData?.collectionUpdate?.userErrors?.length > 0) {
            log.error(
              "Alternative collection update user errors:",
              updateData.collectionUpdate.userErrors,
            );
          } else {
            return true;
          }
        }
        return false;
      }
      if (data?.collectionAddProducts?.collection) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      return false;
    }
  }
  async findOriginalProductData(title) {
    try {
      const dsStorage = await Crawler.DataSetOpen(this.storageId);
      const allData = await dsStorage.getData({ offset: 0, limit: 1e4 });
      let foundItem = allData.items.find((item) => item.title === title);
      if (!foundItem) {
        foundItem = allData.items.find(
          (item) => title.includes(item.title) || item.title.includes(title),
        );
      }
      if (!foundItem) {
        foundItem = allData.items.find(
          (item) => item.title.toLowerCase() === title.toLowerCase(),
        );
      }
      return foundItem;
    } catch (error) {
      return null;
    }
  }
}
const shopifyIpc = () => {
  electron.ipcMain.handle(
    "shopify:upload",
    async (_event, storageId, selectedLocationId, storeIndex) => {
      try {
        const shopify = new Shopify(storageId, storeIndex);
        if (selectedLocationId) {
          shopify.selectedLocationId = selectedLocationId;
        }
        return await shopify.upload();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
      }
    },
  );
  electron.ipcMain.handle(
    "shopify:getLocations",
    async (_event, storageId, storeIndex) => {
      try {
        const shopify = new Shopify(storageId, storeIndex);
        await shopify.loadAllLocations();
        return shopify.getCachedLocations();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
      }
    },
  );
  electron.ipcMain.handle("shopify:test", async (_event) => {});
  electron.ipcMain.handle("shopify:getStoreList", async () => {
    const settings = electronStore.get("appSettings");
    const allStores = settings?.shopifySettingsV2?.stores || [];
    return allStores.map((store, index) => ({
      storeName: store.storeName.replace(".myshopify.com", ""),
      displayName: store.displayName,
      // 스토어 표시 이름
      primaryDomain: store.primaryDomain,
      // 기본 도메인
      type: store.clientId ? "oauth" : "token",
      // clientId 있으면 OAuth, 없으면 토큰 직접 입력
      index,
      margin: store.margin,
    }));
  });
  electron.ipcMain.handle("dataset:list", async () => {
    const storagePath = path.join(
      electron.app.getPath("sessionData"),
      "./storage/datasets",
    );
    if (!fs.existsSync(storagePath)) {
      return [];
    }
    const folders = fs
      .readdirSync(storagePath, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name)
      .sort((a, b) => b.localeCompare(a));
    const datasets = [];
    for (const folder of folders) {
      try {
        const dsStorage = await Crawler.DataSetOpen(folder);
        const info = await dsStorage.getInfo();
        datasets.push({
          id: folder,
          name: folder,
          // 폴더명 그대로 사용 (예: "1230_143025")
          count: info?.itemCount || 0,
        });
      } catch {
        datasets.push({
          id: folder,
          name: folder,
          count: 0,
        });
      }
    }
    return datasets;
  });
  electron.ipcMain.handle("shopify:uploadMulti", async (_event, params) => {
    log.info(`[다중 업로드] 핸들러 진입 - params:`, JSON.stringify(params));
    try {
      const { storeIndexes, datasetId } = params;
      log.info(`[다중 업로드] 공유 데이터 로드 시작...`);
      const sharedData = await Shopify.prepareSharedData(datasetId);
      const totalItems = sharedData.stats.uploaded;
      log.info(
        `[다중 업로드] 시작 - 데이터셋: ${datasetId}, 스토어: ${storeIndexes.length}개, 상품: ${totalItems}개 (로컬 중복 제거됨)`,
      );
      for (const storeIndex of storeIndexes) {
        sendToRenderer("multi-upload:progress", {
          storeIndex,
          status: "pending",
          progress: 0,
          processed: 0,
          total: totalItems,
        });
      }
      const STAGGER_DELAY_MS = 2e3;
      const uploadPromises = storeIndexes.map(async (storeIndex, idx) => {
        try {
          if (idx > 0) {
            log.info(
              `[다중 업로드] 스토어 ${storeIndex} - ${(idx * STAGGER_DELAY_MS) / 1e3}초 후 시작`,
            );
            await new Promise((resolve) =>
              setTimeout(resolve, idx * STAGGER_DELAY_MS),
            );
          }
          log.info(`[다중 업로드] 스토어 ${storeIndex} 업로드 시작`);
          sendToRenderer("multi-upload:progress", {
            storeIndex,
            status: "uploading",
            progress: 0,
            processed: 0,
            total: totalItems,
          });
          const shopify = new Shopify(datasetId, storeIndex);
          shopify.setPreparedData(sharedData);
          shopify.onProgress = (progress) => {
            const statusText =
              progress.status === "starting"
                ? "진행 중"
                : progress.status === "failed"
                  ? "실패"
                  : "완료";
            sendToRenderer("multi-upload:progress", {
              storeIndex,
              status: "uploading",
              progress: progress.percent,
              processed: progress.processed,
              total: progress.total,
              // Shopify 중복 제거 후 실제 총 수
              batchInfo: `배치 ${progress.batchNum}/${progress.totalBatches} ${statusText}`,
              error: progress.error,
            });
          };
          const result = await shopify.upload();
          log.info(
            `[다중 업로드] 스토어 ${storeIndex} 업로드 완료 - 성공: ${result.totalSuccess}, 실패: ${result.totalFailed}`,
          );
          if (result.totalFailed === 0) {
            sendToRenderer("multi-upload:progress", {
              storeIndex,
              status: "completed",
              progress: 100,
              processed: result.totalSuccess,
              total: result.toUpload,
            });
            return { storeIndex, success: true, result };
          } else if (result.totalSuccess > 0) {
            const partialMessage = `${result.totalSuccess}개 성공, ${result.totalFailed}개 실패`;
            log.warn(
              `[다중 업로드] 스토어 ${storeIndex} 부분 실패: ${partialMessage}`,
            );
            sendToRenderer("multi-upload:progress", {
              storeIndex,
              status: "partial",
              // 부분 실패 상태 추가
              progress: Math.round(
                (result.totalSuccess / result.toUpload) * 100,
              ),
              processed: result.totalSuccess,
              total: result.toUpload,
              error: partialMessage,
            });
            return {
              storeIndex,
              success: false,
              partial: true,
              result,
              message: partialMessage,
            };
          } else {
            throw new Error("전체 실패");
          }
        } catch (error) {
          const rawMessage =
            error instanceof Error ? error.message : "알 수 없는 오류";
          log.error(`[다중 업로드] 스토어 ${storeIndex} 실패:`, error);
          let errorMessage = rawMessage;
          if (rawMessage.includes("Not Found") || rawMessage.includes("404")) {
            errorMessage = "스토어를 찾을 수 없음 (앱 재연동 필요)";
          } else if (
            rawMessage.includes("Payment Required") ||
            rawMessage.includes("402")
          ) {
            errorMessage = "스토어 결제 필요 (Shopify 구독 확인)";
          } else if (rawMessage.includes("missingScopes")) {
            errorMessage = "API 권한 부족 (재연동 필요)";
          } else if (
            rawMessage.includes("token") ||
            rawMessage.includes("Token") ||
            rawMessage.includes("401")
          ) {
            errorMessage = "토큰 만료 (재연동 필요)";
          } else if (rawMessage.includes("jsonl upload")) {
            errorMessage = "파일 업로드 실패";
          } else if (
            rawMessage.includes("ENOTFOUND") ||
            rawMessage.includes("network")
          ) {
            errorMessage = "네트워크 오류";
          } else if (
            rawMessage.includes("socket hang up") ||
            rawMessage.includes("ECONNRESET")
          ) {
            errorMessage = "연결 끊김 (네트워크 불안정)";
          } else if (rawMessage.includes("Cannot read properties of null")) {
            errorMessage = "데이터 손상 (크롤링 데이터 확인 필요)";
          } else if (rawMessage.includes("fetch failed")) {
            errorMessage = "API 연결 실패 (네트워크 확인)";
          }
          sendToRenderer("multi-upload:progress", {
            storeIndex,
            status: "failed",
            progress: 0,
            processed: 0,
            total: totalItems,
            error: errorMessage,
          });
          return { storeIndex, success: false, message: errorMessage };
        }
      });
      const results = await Promise.allSettled(uploadPromises);
      const successCount = results.filter(
        (r) => r.status === "fulfilled" && r.value.success,
      ).length;
      const partialCount = results.filter(
        (r) => r.status === "fulfilled" && r.value.partial,
      ).length;
      const failCount = results.length - successCount - partialCount;
      log.info(
        `[다중 업로드] 완료 - 성공: ${successCount}개, 부분실패: ${partialCount}개, 실패: ${failCount}개`,
      );
      return {
        success: failCount === 0 && partialCount === 0,
        successCount,
        partialCount,
        failCount,
      };
    } catch (error) {
      log.error(`[다중 업로드] 전체 에러:`, error);
      throw error;
    }
  });
};
const CALLBACK_PORT = 17823;
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/callback`;
let activeServer = null;
let activeTimeout = null;
let activeState = null;
let activeExpectedShop = null;
function cleanupOAuthServer() {
  if (activeTimeout) {
    clearTimeout(activeTimeout);
    activeTimeout = null;
  }
  if (activeServer) {
    try {
      activeServer.close();
    } catch {}
    activeServer = null;
  }
  activeState = null;
  activeExpectedShop = null;
}
const SCOPES = [
  "read_products",
  "write_products",
  "read_inventory",
  "write_inventory",
  "read_locations",
  "write_locations",
  "read_channels",
  "write_channels",
  "read_orders",
  "write_orders",
  "read_files",
  "write_files",
].join(",");
const shopifyOAuthIpc = () => {
  electron.ipcMain.handle(
    "shopify-oauth:start",
    async (_event, shopDomain, clientId, clientSecret, margin = 10) => {
      return new Promise((resolve) => {
        try {
          const normalizedDomain = normalizeShopDomain(shopDomain);
          if (!normalizedDomain) {
            resolve({ success: false, error: "잘못된 스토어 도메인입니다." });
            return;
          }
          if (!clientId || !clientSecret) {
            resolve({
              success: false,
              error: "Client ID와 Client Secret을 입력하세요.",
            });
            return;
          }
          log.info(`[OAuth] 인증 시작: ${normalizedDomain}`);
          cleanupOAuthServer();
          activeState = crypto.randomBytes(16).toString("hex");
          activeExpectedShop = normalizedDomain;
          log.info(
            `[OAuth] State 생성: ${activeState}, 예상 스토어: ${activeExpectedShop}`,
          );
          activeTimeout = setTimeout(
            () => {
              cleanupOAuthServer();
              resolve({
                success: false,
                error: "인증 시간이 초과되었습니다. 다시 시도해주세요.",
              });
            },
            2 * 60 * 1e3,
          );
          const server = http.createServer(async (req, res) => {
            const url = new URL(
              req.url || "",
              `http://localhost:${CALLBACK_PORT}`,
            );
            if (url.pathname === "/callback") {
              const code = url.searchParams.get("code");
              const shop = url.searchParams.get("shop");
              const state = url.searchParams.get("state");
              if (state !== activeState) {
                log.warn(
                  `[OAuth] State 불일치! 예상: ${activeState}, 수신: ${state}`,
                );
                res.writeHead(400, {
                  "Content-Type": "text/html; charset=utf-8",
                });
                res.end(`
                  <!DOCTYPE html>
                  <html>
                  <head><title>인증 실패</title></head>
                  <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                    <h1 style="color: #e53935;">인증 실패</h1>
                    <p>잘못된 인증 요청입니다. 다시 시도해주세요.</p>
                  </body>
                  </html>
                `);
                cleanupOAuthServer();
                resolve({
                  success: false,
                  error:
                    "잘못된 인증 요청입니다 (state 불일치). 다시 시도해주세요.",
                });
                return;
              }
              if (shop !== activeExpectedShop) {
                log.info(
                  `[OAuth] 스토어 도메인 변환: ${activeExpectedShop} → ${shop} (Shopify 내부 ID)`,
                );
              }
              res.writeHead(200, {
                "Content-Type": "text/html; charset=utf-8",
              });
              res.end(`
                <!DOCTYPE html>
                <html>
                <head>
                  <title>연동 완료</title>
                  <style>
                    body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
                    .container { text-align: center; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    h1 { color: #5c6ac4; margin-bottom: 16px; }
                    p { color: #666; }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <h1>연동 완료</h1>
                    <p>스파크 앱으로 돌아가주세요.</p>
                    <p style="color: #999; font-size: 14px;">이 창은 닫아도 됩니다.</p>
                  </div>
                </body>
                </html>
              `);
              cleanupOAuthServer();
              if (!code || !shop) {
                resolve({
                  success: false,
                  error: "인증 코드를 받지 못했습니다.",
                });
                return;
              }
              try {
                log.info(`[OAuth] 인증 코드 수신: ${shop}`);
                const tokenData = await exchangeToken(
                  shop,
                  code,
                  clientId,
                  clientSecret,
                );
                const shopInfo = await fetchShopInfo(
                  shop,
                  tokenData.access_token,
                );
                log.info(
                  `[OAuth] 스토어 정보: ${shopInfo.name} (${shopInfo.primaryDomain})`,
                );
                const store = {
                  storeName: shop,
                  displayName: shopInfo.name,
                  // 스토어 표시 이름
                  primaryDomain: shopInfo.primaryDomain,
                  // 기본 도메인
                  accessToken: tokenData.access_token,
                  refreshToken: tokenData.refresh_token,
                  tokenExpiresAt: tokenData.expires_in
                    ? Date.now() + tokenData.expires_in * 1e3
                    : void 0,
                  clientId,
                  // 토큰 갱신을 위해 저장
                  clientSecret,
                  // 토큰 갱신을 위해 저장
                  margin,
                  connectedAt: Date.now(),
                };
                saveStore(store);
                resolve({ success: true, store });
              } catch (error) {
                log.error(`[OAuth] 토큰 교환 실패: ${error}`);
                resolve({ success: false, error: `토큰 교환 실패: ${error}` });
              }
            } else {
              res.writeHead(404);
              res.end("Not Found");
            }
          });
          activeServer = server;
          server.listen(CALLBACK_PORT, () => {
            log.info(`[OAuth] 콜백 서버 시작: ${REDIRECT_URI}`);
            const authUrl = buildAuthUrl(
              normalizedDomain,
              clientId,
              activeState,
            );
            electron.shell.openExternal(authUrl);
          });
          server.on("error", (err) => {
            log.error(`[OAuth] 서버 에러: ${err}`);
            cleanupOAuthServer();
            resolve({
              success: false,
              error: `서버 시작 실패: ${err.message}`,
            });
          });
        } catch (error) {
          log.error(`[OAuth] 인증 시작 실패: ${error}`);
          resolve({ success: false, error: `인증 시작 실패: ${error}` });
        }
      });
    },
  );
  electron.ipcMain.handle("shopify-oauth:cancel", async () => {
    cleanupOAuthServer();
    log.info("[OAuth] 연동 취소됨");
    return true;
  });
  electron.ipcMain.handle("shopify-oauth:getStores", async () => {
    const settings = electronStore.get("appSettings");
    return settings?.shopifySettingsV2?.stores || [];
  });
  electron.ipcMain.handle(
    "shopify-oauth:disconnect",
    async (_event, storeName) => {
      const settings = electronStore.get("appSettings");
      if (!settings?.shopifySettingsV2?.stores) {
        return false;
      }
      const stores = settings.shopifySettingsV2.stores.filter(
        (s) => s.storeName !== storeName,
      );
      electronStore.set("appSettings", {
        ...settings,
        shopifySettingsV2: {
          stores,
          selectedStoreIndex: Math.max(0, stores.length - 1),
        },
      });
      log.info(`[OAuth] 스토어 연결 해제: ${storeName}`);
      return true;
    },
  );
  electron.ipcMain.handle(
    "shopify-oauth:selectStore",
    async (_event, index) => {
      const settings = electronStore.get("appSettings");
      if (!settings?.shopifySettingsV2?.stores) {
        return false;
      }
      if (index < 0 || index >= settings.shopifySettingsV2.stores.length) {
        return false;
      }
      electronStore.set("appSettings", {
        ...settings,
        shopifySettingsV2: {
          ...settings.shopifySettingsV2,
          selectedStoreIndex: index,
        },
      });
      return true;
    },
  );
  electron.ipcMain.handle(
    "shopify-oauth:addTokenStore",
    async (_event, storeName, accessToken, margin) => {
      let normalizedName = storeName.trim().toLowerCase();
      if (!normalizedName.includes(".myshopify.com")) {
        normalizedName = `${normalizedName}.myshopify.com`;
      }
      try {
        log.info(`[Token] 토큰 검증 시작: ${normalizedName}`);
        const response = await fetch(
          `https://${normalizedName}/admin/api/2024-01/shop.json`,
          {
            headers: {
              "X-Shopify-Access-Token": accessToken,
              "Content-Type": "application/json",
            },
          },
        );
        if (!response.ok) {
          const errorText = await response.text();
          log.error(
            `[Token] 토큰 검증 실패: ${response.status} - ${errorText}`,
          );
          if (response.status === 401) {
            return {
              success: false,
              error: "Access Token이 올바르지 않습니다.",
            };
          } else if (response.status === 404) {
            return {
              success: false,
              error: "스토어를 찾을 수 없습니다. 스토어 이름을 확인해주세요.",
            };
          } else {
            return { success: false, error: `연결 실패: ${response.status}` };
          }
        }
        log.info(`[Token] 토큰 검증 성공: ${normalizedName}`);
      } catch (error) {
        log.error(`[Token] 토큰 검증 중 오류: ${error}`);
        return { success: false, error: `연결 실패: ${error}` };
      }
      const settings = electronStore.get("appSettings");
      const existingStores = settings?.shopifySettingsV2?.stores || [];
      const storeIndex = existingStores.findIndex(
        (s) => s.storeName === normalizedName,
      );
      const newStore = {
        storeName: normalizedName,
        accessToken,
        margin,
        connectedAt: Date.now(),
        // OAuth 관련 필드는 없음 (토큰 직접 입력 방식)
      };
      let newStores;
      if (storeIndex >= 0) {
        newStores = [...existingStores];
        newStores[storeIndex] = newStore;
      } else {
        newStores = [...existingStores, newStore];
      }
      electronStore.set("appSettings", {
        ...settings,
        shopifySettingsV2: {
          stores: newStores,
          selectedStoreIndex:
            storeIndex >= 0 ? storeIndex : newStores.length - 1,
        },
      });
      log.info(`[Token] 스토어 추가 완료: ${normalizedName}`);
      return { success: true, store: newStore };
    },
  );
  electron.ipcMain.handle(
    "shopify-oauth:updateMargin",
    async (_event, storeName, margin) => {
      const settings = electronStore.get("appSettings");
      if (!settings?.shopifySettingsV2?.stores) {
        return false;
      }
      const stores = settings.shopifySettingsV2.stores.map((s) =>
        s.storeName === storeName ? { ...s, margin } : s,
      );
      electronStore.set("appSettings", {
        ...settings,
        shopifySettingsV2: {
          ...settings.shopifySettingsV2,
          stores,
        },
      });
      return true;
    },
  );
};
function normalizeShopDomain(input) {
  if (!input || input.trim() === "") {
    return null;
  }
  let domain = input.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, "");
  domain = domain.replace(/\/$/, "");
  if (!domain.includes(".myshopify.com")) {
    domain = `${domain}.myshopify.com`;
  }
  return domain;
}
function buildAuthUrl(shopDomain, clientId, state) {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    state,
  });
  return `https://${shopDomain}/admin/oauth/authorize?${params.toString()}`;
}
async function exchangeToken(shopDomain, code, clientId, clientSecret) {
  const response = await fetch(
    `https://${shopDomain}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    },
  );
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`토큰 교환 HTTP 에러: ${response.status} - ${errorText}`);
  }
  return response.json();
}
async function fetchShopInfo(shopDomain, accessToken) {
  const response = await fetch(
    `https://${shopDomain}/admin/api/2024-01/shop.json`,
    {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    },
  );
  if (!response.ok) {
    log.warn(`[OAuth] Shop 정보 조회 실패: ${response.status}`);
    return { name: shopDomain, primaryDomain: shopDomain };
  }
  const data = await response.json();
  const shop = data.shop;
  return {
    name: shop.name || shopDomain,
    // domain이 있으면 사용, 없으면 myshopify_domain 사용
    primaryDomain: shop.domain || shop.myshopify_domain || shopDomain,
  };
}
function saveStore(store) {
  const settings = electronStore.get("appSettings");
  const existingStores = settings?.shopifySettingsV2?.stores || [];
  const storeIndex = existingStores.findIndex(
    (s) => s.storeName === store.storeName,
  );
  let newStores;
  if (storeIndex >= 0) {
    newStores = [...existingStores];
    newStores[storeIndex] = store;
  } else {
    newStores = [...existingStores, store];
  }
  electronStore.set("appSettings", {
    ...settings,
    shopifySettingsV2: {
      stores: newStores,
      selectedStoreIndex: storeIndex >= 0 ? storeIndex : newStores.length - 1,
    },
  });
  log.info(`[OAuth] 스토어 저장 완료: ${store.storeName}`);
}
if (typeof globalThis.WebSocket === "undefined") {
  try {
    const WS = require("ws");
    globalThis.WebSocket = WS;
  } catch (e) {
    log.error(
      "[Supabase] ws 패키지 로드 실패 - Realtime 기능이 작동하지 않을 수 있습니다:",
      e,
    );
  }
}
let supabase = null;
let userChannel = null;
let activeChannelId = 0;
let realtimeConfig = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY_MS = 3e3;
let reconnectTimer = null;
let stabilityTimer = null;
const STABLE_THRESHOLD_MS = 3e4;
const attemptReconnect = async () => {
  if (!realtimeConfig) {
    log.warn("[Supabase] No realtime config saved, cannot reconnect");
    return;
  }
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    log.error(
      `[Supabase] Realtime 재연결 ${MAX_RECONNECT_ATTEMPTS}회 실패 - 중복 로그인 체크 없이 진행`,
    );
    return;
  }
  reconnectAttempts++;
  const delay = Math.min(
    RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts - 1),
    6e4,
  );
  log.info(
    `[Supabase] Realtime 재연결 시도 ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} (${delay / 1e3}초 후)`,
  );
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      const { userId, sessionId, onForceLogout, forceLogin } = realtimeConfig;
      await subscribeToUserChannel(
        userId,
        sessionId,
        onForceLogout,
        forceLogin,
      );
    } catch (err) {
      log.error("[Supabase] Reconnect failed:", err);
      attemptReconnect();
    }
  }, delay);
};
const initSupabase = () => {
  if (supabase) return supabase;
  const supabaseUrl = "https://dagucfulqzvcmjfxuucl.supabase.co";
  const supabaseAnonKey =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhZ3VjZnVscXp2Y21qZnh1dWNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzk3MTAsImV4cCI6MjA4MDc1NTcxMH0.r4La-yLGJBBkuPnJECZyR0XPbCkTOEMHDUG8Kjrqgn4";
  supabase = supabaseJs.createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: false,
      // Electron에서는 직접 관리
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
      // WebSocket 연결 안정성 향상
      heartbeatIntervalMs: 15e3,
      // 15초마다 heartbeat (기본 30초)
      timeout: 6e4,
      // 60초 타임아웃 (기본 10초)
    },
  });
  return supabase;
};
const getSupabase = () => {
  if (!supabase) {
    return initSupabase();
  }
  return supabase;
};
const getEmailByUserId = async (userId) => {
  const client = getSupabase();
  const { data, error } = await client
    .from("users")
    .select("email")
    .eq("user_id", userId)
    .single();
  if (error || !data) {
    return null;
  }
  return data.email;
};
const loginByUserId = async (userId, password) => {
  const email = await getEmailByUserId(userId);
  if (!email) {
    return {
      error: {
        message: "아이디 또는 비밀번호가 올바르지 않습니다.",
        code: 401,
      },
    };
  }
  return await login(email, password);
};
const login = async (email, password) => {
  const client = getSupabase();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    return {
      error: {
        message:
          error.message === "Invalid login credentials"
            ? "이메일 또는 비밀번호가 올바르지 않습니다."
            : error.message,
        code: 401,
      },
    };
  }
  const { data: userProfile, error: profileError } = await client
    .from("users")
    .select("*")
    .eq("id", data.user.id)
    .single();
  if (profileError) {
    return {
      error: {
        message: "사용자 정보를 조회할 수 없습니다.",
        code: 500,
      },
    };
  }
  if (!userProfile.spark_approved) {
    await client.auth.signOut();
    return {
      error: {
        message: "관리자 승인 대기 중입니다.",
        code: 403,
      },
    };
  }
  if (
    userProfile.spark_expires_at &&
    new Date(userProfile.spark_expires_at) < /* @__PURE__ */ new Date()
  ) {
    await client.auth.signOut();
    return {
      error: {
        message: "사용 기간이 만료되었습니다.",
        code: 403,
      },
    };
  }
  return {
    data: {
      user: data.user,
      session: data.session,
      profile: userProfile,
    },
  };
};
const logout = async () => {
  const client = getSupabase();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (stabilityTimer) {
    clearTimeout(stabilityTimer);
    stabilityTimer = null;
  }
  realtimeConfig = null;
  reconnectAttempts = 0;
  activeChannelId++;
  if (userChannel) {
    try {
      await client.removeChannel(userChannel);
    } catch (err) {
      log.warn("[Supabase] 채널 제거 실패 (무시):", err);
    }
    userChannel = null;
  }
  await client.auth.signOut();
};
const subscribeToUserChannel = async (
  userId,
  sessionId,
  onForceLogout,
  forceLogin = false,
) => {
  const client = getSupabase();
  realtimeConfig = { userId, sessionId, onForceLogout, forceLogin };
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (stabilityTimer) {
    clearTimeout(stabilityTimer);
    stabilityTimer = null;
  }
  activeChannelId++;
  const myChannelId = activeChannelId;
  if (userChannel) {
    try {
      await client.removeChannel(userChannel);
    } catch (err) {
      log.warn("[Supabase] 이전 채널 제거 실패 (무시):", err);
    }
    userChannel = null;
  }
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      log.warn(
        "[Supabase] Realtime 채널 연결 타임아웃 - 중복 로그인 체크 없이 진행합니다.",
      );
      resolve(true);
    }, 1e4);
    userChannel = client.channel(`user:${userId}`, {
      config: {
        presence: {
          key: sessionId,
        },
      },
    });
    userChannel
      .on("broadcast", { event: "force_logout" }, (payload) => {
        if (myChannelId !== activeChannelId) return;
        if (payload.payload?.session_id !== sessionId) {
          onForceLogout("다른 곳에서 로그인하여 로그아웃 되었습니다.");
        }
      })
      .on("presence", { event: "sync" }, () => {
        if (myChannelId !== activeChannelId) return;
        const state = userChannel?.presenceState() || {};
        const sessions = Object.keys(state);
        if (sessions.length > 1 && !forceLogin) {
          clearTimeout(timeout);
          resolve(false);
          return;
        }
        if (sessions.length > 1 && forceLogin) {
          userChannel?.send({
            type: "broadcast",
            event: "force_logout",
            payload: { session_id: sessionId },
          });
        }
      })
      .subscribe(async (status, err) => {
        if (myChannelId !== activeChannelId) {
          log.debug(
            `[Supabase] 이전 채널(${myChannelId}) 이벤트 무시 (현재: ${activeChannelId}), status: ${status}`,
          );
          return;
        }
        if (status === "SUBSCRIBED") {
          await userChannel?.track({ session_id: sessionId });
          clearTimeout(timeout);
          log.info("[Supabase] Realtime 연결 완료");
          if (stabilityTimer) clearTimeout(stabilityTimer);
          stabilityTimer = setTimeout(() => {
            if (myChannelId === activeChannelId) {
              reconnectAttempts = 0;
              log.info("[Supabase] Realtime 연결 안정 (30초 유지)");
            }
          }, STABLE_THRESHOLD_MS);
          resolve(true);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          log.error("[Supabase] Realtime channel error:", status, err);
          clearTimeout(timeout);
          attemptReconnect();
          resolve(true);
        } else if (status === "CLOSED") {
          log.debug(`[Supabase] Channel CLOSED (channelId: ${myChannelId})`);
          attemptReconnect();
        }
      });
  });
};
let currentSessionId = null;
const authIpc = () => {
  electron.ipcMain.handle("auth:login", async (_event, userId, password) => {
      try {
        // 인증 우회 - 항상 성공 반환
        log.info("[Auth] 인증 우회 - 자동 로그인");
        return {
          data: {
            user: { id: "local-user", email: "local@spark.custom" },
            session: { access_token: "bypass" },
            profile: {
              id: "local-user",
              user_id: userId || "admin",
              email: "local@spark.custom",
              spark_approved: true,
              spark_expires_at: "2099-12-31T23:59:59Z",
            },
          },
        };
      } catch (error) {
        log.error("[Auth] 로그인 에러:", error);
        return {
          error: { message: "로그인 중 오류가 발생했습니다.", code: 500 },
        };
      }
    });
  electron.ipcMain.handle(
    "auth:connectRealtime",
    async (_event, userId, forceLogin = false) => {
      // Realtime 구독 우회
      log.info("[Auth] Realtime 우회 - 중복 로그인 체크 건너뜀");
      return true;
    },
  );
  electron.ipcMain.handle("auth:logout", async () => {
    try {
      await Crawler.stop("", true);
      await logout();
      currentSessionId = null;
    } catch (error) {
      log.error("[Auth] 로그아웃 에러:", error);
    }
  });
};
const sendToRenderer = (channel, ...args) => {
  const window2 = electron.BrowserWindow.getAllWindows()[0];
  if (!window2) return;
  window2.webContents.send(channel, ...args);
};
const sendLogToRenderer = (log2) => {
  const window2 = electron.BrowserWindow.getAllWindows()[0];
  if (!window2) return;
  window2.webContents.send("crawler:log", log2);
};
function initIPC() {
  crawlerIPC();
  electronIPC();
  storeIPC();
  shopifyIpc();
  shopifyOAuthIpc();
  authIpc();
}
const browserZip = path
  .join(__dirname, "../../resources/browser.zip")
  .replace("app.asar", "app.asar.unpacked");
process.env.PLAYWRIGHT_DISABLE_MEMORY_SNAPSHOT = "1";
process.env.PLAYWRIGHT_DISABLE_CRASH_REPORTS = "1";
process.env.PLAYWRIGHT_DISABLE_LOGGING = "1";
electron.app.setAppUserModelId("Spark");
log.initialize();
log.transports.file.maxSize = 10 * 1024 * 1024;
const crawlerLog = log.create({ logId: "crawler" });
crawlerLog.transports.file.fileName = "crawler.log";
crawlerLog.transports.file.maxSize = 10 * 1024 * 1024;
log.info("main process initialize");
main.setupTitlebar();
process.env.CRAWLEE_STORAGE_DIR = path.join(
  electron.app.getPath("sessionData"),
  "./storage",
);
function createWindow() {
  const mainWindow = new electron.BrowserWindow({
    width: 1200,
    // 초기 창 너비
    height: 700,
    // 초기 창 높이
    minWidth: 1120,
    // 최소 창 너비 (UI가 깨지지 않도록)
    minHeight: 720,
    // 최소 창 높이
    show: false,
    // 준비될 때까지 창을 숨김 (깜빡임 방지)
    titleBarStyle: "hidden",
    // 기본 타이틀바 숨김
    titleBarOverlay: true,
    // 타이틀바 오버레이 활성화
    ...(process.platform === "linux" ? { icon } : {}),
    // Linux에서만 아이콘 설정
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      // Preload 스크립트 경로
      sandbox: false,
      // 샌드박스 비활성화 (Node.js API 사용을 위해)
    },
  });
  const menu = new electron.Menu();
  electron.Menu.setApplicationMenu(menu);
  main.attachTitlebarToWindow(mainWindow);
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.executeJavaScript(`
      (function() {
        try {
          const fakeProfile = {
            id: "local-user",
            user_id: "admin",
            email: "local@spark.custom",
            spark_approved: true,
            spark_expires_at: "2099-12-31T23:59:59Z"
          };
          const fakeUser = { id: "local-user", email: "local@spark.custom" };
          const fakeSession = { access_token: "bypass" };
          localStorage.setItem("spark_user", JSON.stringify(fakeUser));
          localStorage.setItem("spark_profile", JSON.stringify(fakeProfile));
          localStorage.setItem("spark_session", JSON.stringify(fakeSession));
          localStorage.setItem("spark_auth", "true");
          console.log("[AutoLogin] localStorage set, reloading...");
        } catch(e) {
          console.error("[AutoLogin] error:", e);
        }
      })();
    `);
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  return mainWindow;
}
const appUpdateCheck = (mainWindow) => {
  electronUpdater.autoUpdater.autoDownload = false;
  electronUpdater.autoUpdater.autoInstallOnAppQuit = false;
  electronUpdater.autoUpdater.on("update-available", () => {
    log.info("update-available");
    new electron.Notification({
      title: "업데이트 알림",
      body: "새로운 업데이트가 있습니다.\n업데이트 다운로드를 진행합니다.",
    }).show();
    electronUpdater.autoUpdater.downloadUpdate();
  });
  electronUpdater.autoUpdater.on("update-downloaded", () => {
    log.info("update-downloaded");
    electron.dialog
      .showMessageBox(mainWindow, {
        message:
          "새로운 업데이트가 있습니다.\n프로그램을 재시작하여 업데이트를 적용하시겠습니까?",
        buttons: ["확인 - 지금 업데이트 설치", "취소 - 나중에 설치"],
      })
      .then(({ response }) => {
        if (response === 0) electronUpdater.autoUpdater.quitAndInstall();
      });
  });
  electronUpdater.autoUpdater.checkForUpdates();
};
const unpackResourceFiles = async () => {
  const chromeExecutablePath = path.join(
    electron.app.getPath("sessionData"),
    "/browser/chromium-1181/chrome-win/chrome.exe",
  );
  if (!fs.existsSync(chromeExecutablePath)) {
    log.info("unpackResourceFiles - Chromium not found, extracting...");
    const extractPath = path.join(
      electron.app.getPath("sessionData"),
      "browser",
    );
    if (!fs.existsSync(browserZip)) {
      log.error("browser.zip not found at:", browserZip);
      electron.dialog.showErrorBox(
        "오류",
        `필수 파일을 찾을 수 없습니다.
프로그램을 다시 설치해주세요.

경로: ${browserZip}`,
      );
      electron.app.quit();
      return;
    }
    try {
      log.info("zip extract start");
      log.info(`Source: ${browserZip}`);
      log.info(`Target: ${extractPath}`);
      const zip = new admZip(browserZip);
      const zipEntries = zip.getEntries();
      log.info(`Total files in zip: ${zipEntries.length}`);
      zip.extractAllTo(extractPath, true);
      if (fs.existsSync(chromeExecutablePath)) {
        log.info("zip extract done - Chromium successfully extracted");
      } else {
        throw new Error("Chromium executable not found after extraction");
      }
    } catch (error) {
      log.error("zip extract failed:", error);
      electron.dialog.showErrorBox(
        "압축 해제 실패",
        `브라우저 파일 압축 해제에 실패했습니다.

에러: ${error}

프로그램을 다시 설치해주세요.`,
      );
      electron.app.quit();
      return;
    }
  } else {
    log.info("Chromium already extracted, skipping unpack");
  }
};
const migrateShopifySettings = () => {
  try {
    const settings = electronStore.get("appSettings");
    const legacy = settings?.shopifySettings;
    const v2Stores = settings?.shopifySettingsV2?.stores || [];
    if (
      legacy?.shopifyStoreName &&
      legacy?.shopifyAccessToken &&
      v2Stores.length === 0
    ) {
      log.info("[Migration] 레거시 Shopify 설정 마이그레이션 시작...");
      let storeName = legacy.shopifyStoreName.trim().toLowerCase();
      if (!storeName.includes(".myshopify.com")) {
        storeName = `${storeName}.myshopify.com`;
      }
      const migratedStore = {
        storeName,
        accessToken: legacy.shopifyAccessToken,
        margin: legacy.margin || 0,
        connectedAt: Date.now(),
      };
      electronStore.set("appSettings", {
        ...settings,
        shopifySettingsV2: {
          stores: [migratedStore],
          selectedStoreIndex: 0,
        },
      });
      log.info(`[Migration] 마이그레이션 완료: ${storeName}`);
    } else {
      log.info("[Migration] 마이그레이션 필요 없음");
    }
  } catch (error) {
    log.error(`[Migration] 마이그레이션 실패: ${error}`);
  }
};
electron.app.whenReady().then(async () => {
  await unpackResourceFiles();
  electron.app.on("browser-window-created", (_, window2) => {
    utils.optimizer.watchWindowShortcuts(window2);
  });
  if (process.platform === "win32") {
    process.env.NODE_OPTIONS = "--max-old-space-size=4096";
    process.env.NODE_ENV = "production";
  }
  migrateShopifySettings();
  initIPC();
  const mainWindow = createWindow();
  if (process.env.ENABLE_DEVTOOLS) {
    electron.globalShortcut.register("CommandOrControl+Shift+I", () => {
      mainWindow.webContents.toggleDevTools();
    });
    log.info("DevTools 단축키 활성화됨 (Ctrl+Shift+I)");
  }
  appUpdateCheck(mainWindow);
  electron.app.on("activate", function () {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
exports.crawlerLog = crawlerLog;
