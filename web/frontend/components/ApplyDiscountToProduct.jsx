import { useCallback, useState } from "react";
import { Card, TextField } from "@shopify/polaris";
import { Toast } from "@shopify/app-bridge-react";
import { useAuthenticatedFetch } from "../hooks";

export function ApplyDiscountToProduct() {
  const emptyToastProps = { content: null };
  const [isLoading, setIsLoading] = useState(false);
  const [toastProps, setToastProps] = useState(emptyToastProps);
  const [discount, setDiscount] = useState(0);
  const [productName, setProductName] = useState("");
  const fetch = useAuthenticatedFetch();

  const handleInputChange = useCallback(
    (newValue) => setDiscount(newValue),
    []
  );

  const handleTagInputChange = useCallback(
    (newValue) => setProductName(newValue),
    []
  );

  const toastMarkup = toastProps.content && (
    <Toast {...toastProps} onDismiss={() => setToastProps(emptyToastProps)} />
  );

  async function applyDiscountsToProducts() {
    if (discount < 0 || discount > 100) {
      setToastProps({
        content: "Discount must be between 0 and 100",
        error: true,
      });
      return;
    } else if (productName.length === 0) {
      setToastProps({
        content: "Name cant be empty",
        error: true,
      });
      return;
    }

    setIsLoading(true);
    const discountFloat = parseFloat(discount);
    let response = await fetch("/api/discountProduct", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        discount: discountFloat,
        productName: productName,
      }),
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

  async function resetDiscountProduct() {
    if (productName.length === 0) {
      setToastProps({
        content: "Name cant be empty",
        error: true,
      });
      return;
    }

    setIsLoading(true);
    let response = await fetch("/api/resetDiscountProduct", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        productName: productName,
      }),
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
  return (
    <>
      {toastMarkup}
      <Card
        title="Apply discount to a product with name"
        sectioned
        primaryFooterAction={{
          content: "Apply discount to Product",
          onAction: applyDiscountsToProducts,
          loading: isLoading,
        }}
        secondaryFooterActions={[
          {
            content: "Remove discount from Product",
            onAction: resetDiscountProduct,
            loading: isLoading,
          },
        ]}
      >
        <TextField
          type="text"
          label="Enter Product name (Case Sensitive)"
          value={productName}
          onChange={handleTagInputChange}
          autoComplete="off"
        />
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
