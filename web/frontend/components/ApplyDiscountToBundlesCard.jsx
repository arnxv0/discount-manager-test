import { useCallback, useState } from "react";
import { Card, TextField, Button } from "@shopify/polaris";
import { Toast } from "@shopify/app-bridge-react";
import { useAuthenticatedFetch } from "../hooks";

export function ApplyDiscountToBundlesCard() {
  const emptyToastProps = { content: null };
  const [isLoading, setIsLoading] = useState(false);
  const [toastProps, setToastProps] = useState(emptyToastProps);
  const [discount, setDiscount] = useState(0);
  const fetch = useAuthenticatedFetch();

  const handleInputChange = useCallback(
    (newValue) => setDiscount(newValue),
    []
  );

  const toastMarkup = toastProps.content && (
    <Toast {...toastProps} onDismiss={() => setToastProps(emptyToastProps)} />
  );

  async function applyDiscountsToBundles() {
    if (discount < 0 || discount > 100) {
      setToastProps({
        content: "Discount must be between 0 and 100",
        error: true,
      });
      return;
    }

    setIsLoading(true);
    const discountFloat = parseFloat(discount);
    let response = await fetch("/api/discountAllBundles", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ discount: discountFloat }),
    });

    if (response.ok) {
      response = await response.json();
      console.log(response);
      setIsLoading(false);
      setToastProps({ content: `${response["message"]}` });
    } else {
      setIsLoading(false);
      setToastProps({
        content: "There was an error applying discounts",
        error: true,
      });
    }
  }

  async function resetDiscountsToBundles() {
    setIsLoading(true);
    const discountFloat = parseFloat(discount);
    let response = await fetch("/api/resetPriceAllBundles", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ discount: discountFloat }),
    });

    if (response.ok) {
      response = await response.json();
      console.log(response);
      setIsLoading(false);
      setToastProps({ content: `${response["message"]}` });
    } else {
      setIsLoading(false);
      setToastProps({
        content: "There was an error resetting",
        error: true,
      });
    }
  }

  return (
    <>
      {toastMarkup}
      <Card
        title="Apply discount to all bundles"
        sectioned
        primaryFooterAction={{
          content: "Apply Discount",
          onAction: applyDiscountsToBundles,
          loading: isLoading,
        }}
        secondaryFooterActions={[
          {
            content: "Reset prices for bundles",
            onAction: resetDiscountsToBundles,
            loading: isLoading,
          },
        ]}
      >
        <TextField
          type="number"
          label="Enter discount percentage"
          value={discount}
          onChange={handleInputChange}
          autoComplete="off"
        />
      </Card>
    </>
  );
}
