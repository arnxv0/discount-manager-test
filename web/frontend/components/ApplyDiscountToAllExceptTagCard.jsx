import { useCallback, useState } from "react";
import { Card, TextField } from "@shopify/polaris";
import { Toast } from "@shopify/app-bridge-react";
import { useAuthenticatedFetch } from "../hooks";

export function ApplyDiscountToAllExceptTagCard() {
  const emptyToastProps = { content: null };
  const [isLoading, setIsLoading] = useState(false);
  const [toastProps, setToastProps] = useState(emptyToastProps);
  const [discount, setDiscount] = useState(0);
  const [tags, setTags] = useState("");
  const fetch = useAuthenticatedFetch();

  const handleInputChange = useCallback(
    (newValue) => setDiscount(newValue),
    []
  );

  const handleTagInputChange = useCallback((newValue) => setTags(newValue), []);

  const toastMarkup = toastProps.content && (
    <Toast {...toastProps} onDismiss={() => setToastProps(emptyToastProps)} />
  );

  async function applyDiscountsToTags() {
    if (discount < 0 || discount > 100) {
      setToastProps({
        content: "Discount must be between 0 and 100",
        error: true,
      });
      return;
    } else if (tags.length === 0) {
      setToastProps({
        content: "Please enter at least one tag",
        error: true,
      });
      return;
    }

    setIsLoading(true);
    const discountFloat = parseFloat(discount);
    let response = await fetch("/api/discountAllProductsExceptTags", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        discount: discountFloat,
        tags: tags,
        includeAll: false,
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

  async function resetDiscountsTags() {
    if (tags.length === 0) {
      setToastProps({
        content: "Please enter at least one tag",
        error: true,
      });
      return;
    }

    setIsLoading(true);
    let response = await fetch("/api/resetPriceAllProductsExceptTags", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tags: tags,
        includeAll: false,
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
        title="Apply discount to all products except Tags"
        sectioned
        primaryFooterAction={{
          content: "Apply discount to all products except tags",
          onAction: applyDiscountsToTags,
          loading: isLoading,
        }}
        secondaryFooterActions={[
          {
            content: "Remove discount to all products except tags",
            onAction: resetDiscountsTags,
            loading: isLoading,
          },
        ]}
      >
        <TextField
          type="text"
          label="Enter tags separated by commas. Eg: 'tag1, tag2, tag3' (Case sensitive and without quotes)"
          value={tags}
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
