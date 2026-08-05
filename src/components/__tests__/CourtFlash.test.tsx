import { render } from "@testing-library/react-native";
import React from "react";
import CourtFlash from "../CourtFlash";

test("renders the court, net, and a ball for each direction", async () => {
  for (const dir of ["left", "center", "right"] as const) {
    const { getByTestId, unmount } = await render(<CourtFlash direction={dir} />);
    expect(getByTestId("court-net")).toBeTruthy();
    expect(getByTestId(`court-ball-${dir}`)).toBeTruthy();
    await unmount();
  }
});

test("positions the ball differently per direction", async () => {
  const { getByTestId: left } = await render(<CourtFlash direction="left" />);
  const leftStyle = left("court-ball-left").props.style;
  const { getByTestId: right } = await render(<CourtFlash direction="right" />);
  const rightStyle = right("court-ball-right").props.style;
  // alignment differs between left and right
  expect(JSON.stringify(leftStyle)).not.toEqual(JSON.stringify(rightStyle));
});
