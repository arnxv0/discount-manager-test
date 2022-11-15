// @ts-check
import { join } from "path";
import { readFileSync } from "fs";
import express from "express";
import cookieParser from "cookie-parser";
import { Shopify, LATEST_API_VERSION } from "@shopify/shopify-api";

import applyAuthMiddleware from "./middleware/auth.js";
import verifyRequest from "./middleware/verify-request.js";
import { setupGDPRWebHooks } from "./gdpr.js";
import productCreator from "./helpers/product-creator.js";
import redirectToAuth from "./helpers/redirect-to-auth.js";
import { BillingInterval } from "./helpers/ensure-billing.js";
import { AppInstallations } from "./app_installations.js";

const USE_ONLINE_TOKENS = false;

const PORT = parseInt(process.env.BACKEND_PORT || process.env.PORT, 10);

// TODO: There should be provided by env vars
const DEV_INDEX_PATH = `${process.cwd()}/frontend/`;
const PROD_INDEX_PATH = `${process.cwd()}/frontend/dist/`;

const DB_PATH = `${process.cwd()}/database.sqlite`;

Shopify.Context.initialize({
  API_KEY: process.env.SHOPIFY_API_KEY,
  API_SECRET_KEY: process.env.SHOPIFY_API_SECRET,
  SCOPES: process.env.SCOPES.split(","),
  HOST_NAME: process.env.HOST.replace(/https?:\/\//, ""),
  HOST_SCHEME: process.env.HOST.split("://")[0],
  API_VERSION: LATEST_API_VERSION,
  IS_EMBEDDED_APP: true,
  // This should be replaced with your preferred storage strategy
  // See note below regarding using CustomSessionStorage with this template.
  SESSION_STORAGE: new Shopify.Session.SQLiteSessionStorage(DB_PATH),
  ...(process.env.SHOP_CUSTOM_DOMAIN && {
    CUSTOM_SHOP_DOMAINS: [process.env.SHOP_CUSTOM_DOMAIN],
  }),
});

// NOTE: If you choose to implement your own storage strategy using
// Shopify.Session.CustomSessionStorage, you MUST implement the optional
// findSessionsByShopCallback and deleteSessionsCallback methods.  These are
// required for the app_installations.js component in this template to
// work properly.

Shopify.Webhooks.Registry.addHandler("APP_UNINSTALLED", {
  path: "/api/webhooks",
  webhookHandler: async (_topic, shop, _body) => {
    await AppInstallations.delete(shop);
  },
});

// The transactions with Shopify will always be marked as test transactions, unless NODE_ENV is production.
// See the ensureBilling helper to learn more about billing in this template.
const BILLING_SETTINGS = {
  required: false,
  // This is an example configuration that would do a one-time charge for $5 (only USD is currently supported)
  // chargeName: "My Shopify One-Time Charge",
  // amount: 5.0,
  // currencyCode: "USD",
  // interval: BillingInterval.OneTime,
};

// This sets up the mandatory GDPR webhooks. You’ll need to fill in the endpoint
// in the “GDPR mandatory webhooks” section in the “App setup” tab, and customize
// the code when you store customer data.
//
// More details can be found on shopify.dev:
// https://shopify.dev/apps/webhooks/configuration/mandatory-webhooks
setupGDPRWebHooks("/api/webhooks");

// export for test use only
export async function createServer(
  root = process.cwd(),
  isProd = process.env.NODE_ENV === "production",
  billingSettings = BILLING_SETTINGS
) {
  const app = express();

  app.set("use-online-tokens", USE_ONLINE_TOKENS);
  app.use(cookieParser(Shopify.Context.API_SECRET_KEY));

  applyAuthMiddleware(app, {
    billing: billingSettings,
  });

  // Do not call app.use(express.json()) before processing webhooks with
  // Shopify.Webhooks.Registry.process().
  // See https://github.com/Shopify/shopify-api-node/blob/main/docs/usage/webhooks.md#note-regarding-use-of-body-parsers
  // for more details.
  app.post("/api/webhooks", async (req, res) => {
    try {
      await Shopify.Webhooks.Registry.process(req, res);
      console.log(`Webhook processed, returned status code 200`);
    } catch (e) {
      console.log(`Failed to process webhook: ${e.message}`);
      if (!res.headersSent) {
        res.status(500).send(e.message);
      }
    }
  });

  // All endpoints after this point will require an active session
  app.use(
    "/api/*",
    verifyRequest(app, {
      billing: billingSettings,
    })
  );

  //   app.get("/api/products/count", async (req, res) => {
  //     const session = await Shopify.Utils.loadCurrentSession(
  //       req,
  //       res,
  //       app.get("use-online-tokens")
  //     );
  //     const { Product } = await import(
  //       `@shopify/shopify-api/dist/rest-resources/${Shopify.Context.API_VERSION}/index.js`
  //     );

  //     const countData = await Product.count({ session });
  //     res.status(200).send(countData);
  //   });

  //   app.get("/api/products/create", async (req, res) => {
  //     const session = await Shopify.Utils.loadCurrentSession(
  //       req,
  //       res,
  //       app.get("use-online-tokens")
  //     );
  //     let status = 200;
  //     let error = null;

  //     try {
  //       await productCreator(session);
  //     } catch (e) {
  //       console.log(`Failed to process products/create: ${e.message}`);
  //       status = 500;
  //       error = e.message;
  //     }
  //     res.status(status).send({ success: status === 200, error });
  //   });

  // All endpoints after this point will have access to a request.body
  // attribute, as a result of the express.json() middleware
  app.use(express.json());

  //////////////////////////////////////// START OF CUSTOM CODE //////////////////////////////////////////////
  app.post("/api/discountAllProductsExceptBundles", async (req, res) => {
    const session = await Shopify.Utils.loadCurrentSession(
      req,
      res,
      app.get("use-online-tokens")
    );

    const { Product, Variant } = await import(
      `@shopify/shopify-api/dist/rest-resources/${Shopify.Context.API_VERSION}/index.js`
    );
    // https://shopify.dev/api/admin-rest/2022-10/resources/product#get-products
    let status = 200;
    let error = null;
    let products = [];
    let totalProductsChanged = 0;
    const discount = req.body.discount / 100;

    try {
      products = await Product.all({
        session: session,
        fields: "id,tags,variants,title",
        limit: 250,
      });
      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        let pTags = p.tags.split(",");
        let varients = [];
        pTags = pTags.map((t) => t.trim());
        const isBundle = pTags.includes("Bundle");
        if (!isBundle) {
          varients = p.variants.map((v) => {
            let prevPrice = parseFloat(v.compare_at_price);
            if (!prevPrice || prevPrice === 0.0 || prevPrice === 0) {
              prevPrice = parseFloat(v.price);
              if (!prevPrice || prevPrice === 0.0 || prevPrice === 0) {
                prevPrice = 0;
              }
            }

            return {
              id: v.id,
              price: prevPrice * (1 - discount),
              compare_at_price: prevPrice,
            };
          });

          console.log(
            `discountAllProductsExceptBundles Updating product: ${p.title}`
          );
          const newP = new Product({ session: session });
          newP.id = p.id;
          newP.variants = varients;
          await newP.save({
            update: true,
          });
          totalProductsChanged++;
        }
      }

      console.log("done");
    } catch (e) {
      console.log(`Failed to process products : ${e.message}`);
      status = 500;
      error = e.message;
    }
    res.status(status).send({
      success: status === 200,
      error,
      message: `Successfully updated ${totalProductsChanged} products to have ${
        discount * 100
      }% off`,
    });
  });

  app.post("/api/resetPriceAllProductsExceptBundles", async (req, res) => {
    const session = await Shopify.Utils.loadCurrentSession(
      req,
      res,
      app.get("use-online-tokens")
    );
    const { Product, Variant } = await import(
      `@shopify/shopify-api/dist/rest-resources/${Shopify.Context.API_VERSION}/index.js`
    );
    // https://shopify.dev/api/admin-rest/2022-10/resources/product#get-products
    let status = 200;
    let error = null;
    let products = [];
    let totalProductsChanged = 0;
    const discount = 0;

    try {
      products = await Product.all({
        session: session,
        fields: "id,tags,variants,title",
        limit: 250,
      });
      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        let pTags = p.tags.split(",");
        let varients = [];
        pTags = pTags.map((t) => t.trim());
        const isBundle = pTags.includes("Bundle");

        if (!isBundle) {
          varients = p.variants.map((v) => {
            let prevPrice = parseFloat(v.compare_at_price);
            if (!prevPrice || prevPrice === 0.0 || prevPrice === 0) {
              prevPrice = parseFloat(v.price);
              if (!prevPrice || prevPrice === 0.0 || prevPrice === 0) {
                prevPrice = 0;
              }
            }

            return {
              id: v.id,
              price: prevPrice,
              compare_at_price: prevPrice,
            };
          });

          console.log(
            `resetPriceAllProductsExceptBundles Updating product: ${p.title}`
          );
          const newP = new Product({ session: session });
          newP.id = p.id;
          newP.variants = varients;
          await newP.save({
            update: true,
          });
          totalProductsChanged++;
        }
      }

      console.log("done");
    } catch (e) {
      console.log(`Failed to process products : ${e.message}`);
      status = 500;
      error = e.message;
    }
    res.status(status).send({
      success: status === 200,
      error,
      message: `Successfully updated ${totalProductsChanged} products to have ${
        discount * 100
      }% off`,
    });
  });

  app.post("/api/discountAllProductsExceptTags", async (req, res) => {
    const session = await Shopify.Utils.loadCurrentSession(
      req,
      res,
      app.get("use-online-tokens")
    );

    const { Product, Variant } = await import(
      `@shopify/shopify-api/dist/rest-resources/${Shopify.Context.API_VERSION}/index.js`
    );
    // https://shopify.dev/api/admin-rest/2022-10/resources/product#get-products
    let status = 200;
    let error = null;
    let products = [];
    let totalProductsChanged = 0;
    const discount = req.body.discount / 100;
    const includeAll = req.body.includeAll;
    const tagsString = req.body.tags;
    let tags = tagsString.split(",");
    tags = tags.map((t) => t.trim());
    console.log(tags);
    try {
      products = await Product.all({
        session: session,
        fields: "id,tags,variants,title",
        limit: 250,
      });
      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        let pTags = p.tags.split(",");
        let varients = [];
        pTags = pTags.map((t) => t.trim());
        let updateProduct = false;
        if (includeAll) {
          if (tags.every((t) => pTags.includes(t))) {
            updateProduct = true;
          }
        } else {
          if (tags.some((t) => pTags.includes(t))) {
            updateProduct = true;
          }
        }
        if (!updateProduct) {
          varients = p.variants.map((v) => {
            let prevPrice = parseFloat(v.compare_at_price);
            if (!prevPrice || prevPrice === 0.0 || prevPrice === 0) {
              prevPrice = parseFloat(v.price);
              if (!prevPrice || prevPrice === 0.0 || prevPrice === 0) {
                prevPrice = 0;
              }
            }

            return {
              id: v.id,
              price: prevPrice * (1 - discount),
              compare_at_price: prevPrice,
            };
          });

          console.log(
            `discountAllProductsExceptTags Updating product: ${p.title}`
          );
          const newP = new Product({ session: session });
          newP.id = p.id;
          newP.variants = varients;
          await newP.save({
            update: true,
          });
          totalProductsChanged++;
        }
      }

      console.log("done");
    } catch (e) {
      console.log(`Failed to process products : ${e.message}`);
      status = 500;
      error = e.message;
    }
    res.status(status).send({
      success: status === 200,
      error,
      message: `Successfully updated ${totalProductsChanged} products to have ${
        discount * 100
      }% off`,
    });
  });

  app.post("/api/resetPriceAllProductsExceptTags", async (req, res) => {
    const session = await Shopify.Utils.loadCurrentSession(
      req,
      res,
      app.get("use-online-tokens")
    );

    const { Product, Variant } = await import(
      `@shopify/shopify-api/dist/rest-resources/${Shopify.Context.API_VERSION}/index.js`
    );
    // https://shopify.dev/api/admin-rest/2022-10/resources/product#get-products
    let status = 200;
    let error = null;
    let products = [];
    let totalProductsChanged = 0;
    const discount = 0;
    const includeAll = req.body.includeAll;
    const tagsString = req.body.tags;
    let tags = tagsString.split(",");
    tags = tags.map((t) => t.trim());
    console.log(tags);

    try {
      products = await Product.all({
        session: session,
        fields: "id,tags,variants,title",
        limit: 250,
      });
      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        let pTags = p.tags.split(",");
        let varients = [];
        pTags = pTags.map((t) => t.trim());
        let updateProduct = false;
        if (includeAll) {
          if (tags.every((t) => pTags.includes(t))) {
            updateProduct = true;
          }
        } else {
          if (tags.some((t) => pTags.includes(t))) {
            updateProduct = true;
          }
        }
        if (!updateProduct) {
          varients = p.variants.map((v) => {
            let prevPrice = parseFloat(v.compare_at_price);
            if (!prevPrice || prevPrice === 0.0 || prevPrice === 0) {
              prevPrice = parseFloat(v.price);
              if (!prevPrice || prevPrice === 0.0 || prevPrice === 0) {
                prevPrice = 0;
              }
            }

            return {
              id: v.id,
              price: prevPrice,
              compare_at_price: prevPrice,
            };
          });

          console.log(
            `resetPriceAllProductsExceptTags Updating product: ${p.title}`
          );
          const newP = new Product({ session: session });
          newP.id = p.id;
          newP.variants = varients;
          await newP.save({
            update: true,
          });
          totalProductsChanged++;
        }
      }

      console.log("done");
    } catch (e) {
      console.log(`Failed to process products : ${e.message}`);
      status = 500;
      error = e.message;
    }
    res.status(status).send({
      success: status === 200,
      error,
      message: `Successfully updated ${totalProductsChanged} products to have ${
        discount * 100
      }% off`,
    });
  });

  app.post("/api/discountTags", async (req, res) => {
    const session = await Shopify.Utils.loadCurrentSession(
      req,
      res,
      app.get("use-online-tokens")
    );
    const { Product, Variant } = await import(
      `@shopify/shopify-api/dist/rest-resources/${Shopify.Context.API_VERSION}/index.js`
    );
    // https://shopify.dev/api/admin-rest/2022-10/resources/product#get-products
    let status = 200;
    let error = null;
    let products = [];
    let totalProductsChanged = 0;
    const discount = req.body.discount / 100;
    const includeAll = req.body.includeAll;
    const tagsString = req.body.tags;
    let tags = tagsString.split(",");
    tags = tags.map((t) => t.trim());
    console.log(tags);

    try {
      products = await Product.all({
        session: session,
        fields: "id,tags,variants,title",
        limit: 250,
      });
      let varients = [];
      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        let pTags = p.tags.split(",");
        pTags = pTags.map((t) => t.trim());
        let updateProduct = false;
        if (includeAll) {
          if (tags.every((t) => pTags.includes(t))) {
            updateProduct = true;
          }
        } else {
          if (tags.some((t) => pTags.includes(t))) {
            updateProduct = true;
          }
        }
        if (updateProduct) {
          varients = p.variants.map((v) => {
            let prevPrice = parseFloat(v.compare_at_price);
            if (!prevPrice || prevPrice === 0.0 || prevPrice === 0) {
              prevPrice = parseFloat(v.price);
              if (!prevPrice || prevPrice === 0.0 || prevPrice === 0) {
                prevPrice = 0;
              }
            }

            return {
              id: v.id,
              price: prevPrice * (1 - discount),
              compare_at_price: prevPrice,
            };
          });

          console.log(`discountTags Updating product: ${p.title}`);
          const newP = new Product({ session: session });
          newP.id = p.id;
          newP.variants = varients;
          await newP.save({
            update: true,
          });
          totalProductsChanged++;
        }
      }

      console.log("done");
    } catch (e) {
      console.log(`Failed to process products : ${e.message}`);
      status = 500;
      error = e.message;
    }
    res.status(status).send({
      success: status === 200,
      error,
      message: `Successfully updated ${totalProductsChanged} products to have ${
        discount * 100
      }% off`,
    });
  });

  app.post("/api/resetDiscountTags", async (req, res) => {
    const session = await Shopify.Utils.loadCurrentSession(
      req,
      res,
      app.get("use-online-tokens")
    );
    const { Product, Variant } = await import(
      `@shopify/shopify-api/dist/rest-resources/${Shopify.Context.API_VERSION}/index.js`
    );
    // https://shopify.dev/api/admin-rest/2022-10/resources/product#get-products
    let status = 200;
    let error = null;
    let products = [];
    let totalProductsChanged = 0;
    const discount = 0;
    const includeAll = req.body.includeAll;
    const tagsString = req.body.tags;
    let tags = tagsString.split(",");
    tags = tags.map((t) => t.trim());
    console.log(tags);

    try {
      products = await Product.all({
        session: session,
        fields: "id,tags,variants,title",
        limit: 250,
      });
      let varients = [];
      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        let pTags = p.tags.split(",");
        pTags = pTags.map((t) => t.trim());
        let updateProduct = false;
        if (includeAll) {
          if (tags.every((t) => pTags.includes(t))) {
            updateProduct = true;
          }
        } else {
          if (tags.some((t) => pTags.includes(t))) {
            updateProduct = true;
          }
        }
        if (updateProduct) {
          varients = p.variants.map((v) => {
            let prevPrice = parseFloat(v.compare_at_price);
            if (!prevPrice || prevPrice === 0.0 || prevPrice === 0) {
              prevPrice = parseFloat(v.price);
              if (!prevPrice || prevPrice === 0.0 || prevPrice === 0) {
                prevPrice = 0;
              }
            }

            return {
              id: v.id,
              price: prevPrice * (1 - discount),
              compare_at_price: prevPrice,
            };
          });
          console.log(`resetDiscountTags Updating product: ${p.title}`);
          const newP = new Product({ session: session });
          newP.id = p.id;
          newP.variants = varients;
          await newP.save({
            update: true,
          });
          totalProductsChanged++;
        }
      }

      console.log("done");
    } catch (e) {
      console.log(`Failed to process products : ${e.message}`);
      status = 500;
      error = e.message;
    }
    res.status(status).send({
      success: status === 200,
      error,
      message: `Successfully updated ${totalProductsChanged} products to have ${
        discount * 100
      }% off`,
    });
  });

  app.post("/api/discountProduct", async (req, res) => {
    const session = await Shopify.Utils.loadCurrentSession(
      req,
      res,
      app.get("use-online-tokens")
    );
    const { Product, Variant } = await import(
      `@shopify/shopify-api/dist/rest-resources/${Shopify.Context.API_VERSION}/index.js`
    );
    // https://shopify.dev/api/admin-rest/2022-10/resources/product#get-products
    let status = 200;
    let error = null;
    let products = [];
    let totalProductsChanged = 0;
    const discount = req.body.discount / 100;
    const productName = req.body.productName.trim();
    console.log(productName);

    try {
      products = await Product.all({
        session: session,
        fields: "id,tags,variants,title",
        limit: 250,
      });
      let varients = [];
      for (let i = 0; i < products.length; i++) {
        const p = products[i];

        if (p.title.trim() === productName) {
          varients = varients.concat(p.variants);
        }
      }

      for (let i = 0; i < varients.length; i++) {
        const v = new Variant({ session: session });
        v.id = varients[i].id;
        let prevPrice = parseFloat(varients[i].compare_at_price);
        if (!prevPrice || prevPrice === 0.0 || prevPrice === 0) {
          prevPrice = parseFloat(varients[i].price);
          if (!prevPrice || prevPrice === 0.0 || prevPrice === 0) {
            prevPrice = 0;
          }
        }
        // console.log(prevPrice * (1 - discount));
        v.price = prevPrice * (1 - discount);
        v.compare_at_price = prevPrice;
        console.log(v);
        await v.save({
          update: true,
        });
        totalProductsChanged++;
      }
      console.log("done");
    } catch (e) {
      console.log(`Failed to process products : ${e.message}`);
      status = 500;
      error = e.message;
    }
    res.status(status).send({
      success: status === 200,
      error,
      message: `Successfully updated ${totalProductsChanged} products to have ${
        discount * 100
      }% off`,
    });
  });

  app.post("/api/resetDiscountProduct", async (req, res) => {
    const session = await Shopify.Utils.loadCurrentSession(
      req,
      res,
      app.get("use-online-tokens")
    );
    const { Product, Variant } = await import(
      `@shopify/shopify-api/dist/rest-resources/${Shopify.Context.API_VERSION}/index.js`
    );
    // https://shopify.dev/api/admin-rest/2022-10/resources/product#get-products
    let status = 200;
    let error = null;
    let products = [];
    let totalProductsChanged = 0;
    const discount = 0;
    const productName = req.body.productName.trim();
    console.log(productName);

    try {
      products = await Product.all({
        session: session,
        fields: "id,tags,variants,title",
        limit: 250,
      });
      let varients = [];
      for (let i = 0; i < products.length; i++) {
        const p = products[i];

        if (p.title.trim() === productName) {
          varients = varients.concat(p.variants);
        }
      }

      for (let i = 0; i < varients.length; i++) {
        const v = new Variant({ session: session });
        v.id = varients[i].id;
        let prevPrice = parseFloat(varients[i].compare_at_price);
        if (!prevPrice || prevPrice === 0.0 || prevPrice === 0) {
          prevPrice = parseFloat(varients[i].price);
          if (!prevPrice || prevPrice === 0.0 || prevPrice === 0) {
            prevPrice = 0;
          }
        }
        v.price = prevPrice * (1 - discount);
        v.compare_at_price = prevPrice;
        await v.save({
          update: true,
        });
        totalProductsChanged++;
      }
      console.log("done");
    } catch (e) {
      console.log(`Failed to process products : ${e.message}`);
      status = 500;
      error = e.message;
    }
    res.status(status).send({
      success: status === 200,
      error,
      message: `Successfully updated ${totalProductsChanged} products to have ${
        discount * 100
      }% off`,
    });
  });
  //////////////////////////////////////// End OF CUSTOM CODE //////////////////////////////////////////////

  app.use((req, res, next) => {
    const shop = Shopify.Utils.sanitizeShop(req.query.shop);
    if (Shopify.Context.IS_EMBEDDED_APP && shop) {
      res.setHeader(
        "Content-Security-Policy",
        `frame-ancestors https://${encodeURIComponent(
          shop
        )} https://admin.shopify.com;`
      );
    } else {
      res.setHeader("Content-Security-Policy", `frame-ancestors 'none';`);
    }
    next();
  });

  if (isProd) {
    const compression = await import("compression").then(
      ({ default: fn }) => fn
    );
    const serveStatic = await import("serve-static").then(
      ({ default: fn }) => fn
    );
    app.use(compression());
    app.use(serveStatic(PROD_INDEX_PATH, { index: false }));
  }

  app.use("/*", async (req, res, next) => {
    if (typeof req.query.shop !== "string") {
      res.status(500);
      return res.send("No shop provided");
    }

    const shop = Shopify.Utils.sanitizeShop(req.query.shop);
    const appInstalled = await AppInstallations.includes(shop);

    if (!appInstalled && !req.originalUrl.match(/^\/exitiframe/i)) {
      return redirectToAuth(req, res, app);
    }

    if (Shopify.Context.IS_EMBEDDED_APP && req.query.embedded !== "1") {
      const embeddedUrl = Shopify.Utils.getEmbeddedAppUrl(req);

      return res.redirect(embeddedUrl + req.path);
    }

    const htmlFile = join(
      isProd ? PROD_INDEX_PATH : DEV_INDEX_PATH,
      "index.html"
    );

    return res
      .status(200)
      .set("Content-Type", "text/html")
      .send(readFileSync(htmlFile));
  });

  return { app };
}

createServer().then(({ app }) => app.listen(PORT));
