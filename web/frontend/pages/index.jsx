import {
  Card,
  Page,
  Layout,
  TextContainer,
  Image,
  Stack,
  Link,
  Heading,
  EmptyState,
  SkeletonBodyText,
  Button,
  TextField,
} from "@shopify/polaris";
import { TitleBar, useNavigate, Loading } from "@shopify/app-bridge-react";

import { trophyImage } from "../assets";

import { ProductsCard } from "../components";
import { useState, useCallback } from "react";
import { ApplyDiscountToAllCard } from "../components/ApplyDiscountToAllCard";
import { ApplyDiscountToBundlesCard } from "../components/ApplyDiscountToBundlesCard";
import { ApplyDiscountToTag } from "../components/ApplyDiscountToTag";
import { ApplyDiscountToProduct } from "../components/ApplyDiscountToProduct";
import { ApplyDiscountToAllExceptTagCard } from "../components/ApplyDiscountToAllExceptTagCard";

export default function HomePage() {
  const navigate = useNavigate();
  const [value, setValue] = useState("Jaded Pixel");
  const handleChange = useCallback((newValue) => setValue(newValue), []);

  const isLoading = false;
  const isRefetching = false;
  const QRCodes = [];

  /* loadingMarkup uses the loading component from AppBridge and components from Polaris  */
  const loadingMarkup = isLoading ? (
    <Card sectioned>
      <Loading />
      <SkeletonBodyText />
    </Card>
  ) : null;

  /* Use Polaris Card and EmptyState components to define the contents of the empty state */
  const emptyStateMarkup =
    !isLoading && !QRCodes?.length ? (
      <Card sectioned>
        <EmptyState
          heading="Create unique QR codes for your product"
          /* This button will take the user to a Create a QR code page */
          action={{
            content: "Create QR code",
            onAction: () => navigate("/qrcodes/new"),
          }}
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
          <p>
            Allow customers to scan codes and buy products using their phones.
          </p>
        </EmptyState>
      </Card>
    ) : null;

  /*
        Use Polaris Page and TitleBar components to create the page layout,
        and include the empty state contents set above.
      */

  function applyDiscountsToProducts() {
    // parse value to float
    const discount = parseFloat(value);
    console.log(discount);
  }

  return (
    <Page>
      <TitleBar title="Apply Discounts" />
      <Layout>
        <Layout.Section>
          {/* <TextField
              label="Apply discount to all except bundles"
              value={value}
              onChange={handleChange}
              autoComplete="off"
            />
            <Button
              accessibilityLabel="Apply Discount"
              onClick={applyDiscountsToProducts}
            >
              Apply Discount
            </Button> */}

          {/* <ApplyDiscountToAllCard /> */}
          <ApplyDiscountToAllExceptTagCard />
          <ApplyDiscountToTag />
          <ApplyDiscountToProduct />
          {/* <ApplyDiscountToBundlesCard /> */}
          {/* {loadingMarkup}
            {emptyStateMarkup} */}
        </Layout.Section>
      </Layout>
    </Page>
  );

  return (
    <Page narrowWidth>
      <TitleBar title="App name" primaryAction={null} />
      <Layout>
        <Layout.Section>
          <Card sectioned>
            <Stack
              wrap={false}
              spacing="extraTight"
              distribution="trailing"
              alignment="center"
            >
              <Stack.Item fill>
                <TextContainer spacing="loose">
                  <Heading>Nice work on building a Shopify app 🎉</Heading>
                  <p>
                    Your app is ready to explore! It contains everything you
                    need to get started including the{" "}
                    <Link url="https://polaris.shopify.com/" external>
                      Polaris design system
                    </Link>
                    ,{" "}
                    <Link url="https://shopify.dev/api/admin-graphql" external>
                      Shopify Admin API
                    </Link>
                    , and{" "}
                    <Link
                      url="https://shopify.dev/apps/tools/app-bridge"
                      external
                    >
                      App Bridge
                    </Link>{" "}
                    UI library and components.
                  </p>
                  <p>
                    Ready to go? Start populating your app with some sample
                    products to view and test in your store.{" "}
                  </p>
                  <p>
                    Learn more about building out your app in{" "}
                    <Link
                      url="https://shopify.dev/apps/getting-started/add-functionality"
                      external
                    >
                      this Shopify tutorial
                    </Link>{" "}
                    📚{" "}
                  </p>
                </TextContainer>
              </Stack.Item>
              <Stack.Item>
                <div style={{ padding: "0 20px" }}>
                  <Image
                    source={trophyImage}
                    alt="Nice work on building a Shopify app"
                    width={120}
                  />
                </div>
              </Stack.Item>
            </Stack>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <ProductsCard />
        </Layout.Section>
      </Layout>
    </Page>
  );
}
