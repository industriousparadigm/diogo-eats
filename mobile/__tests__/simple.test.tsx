import React from "react";
import { Text, View } from "react-native";
import { render, screen } from "@testing-library/react-native";

describe("simple RTLRN smoke", () => {
  it("screen is set after render (async render)", async () => {
    await render(
      <View>
        <Text>Hello World</Text>
      </View>
    );
    expect(screen.getByText("Hello World")).toBeTruthy();
  });
});
