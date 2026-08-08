const screens: any[] = [];

jest.mock("expo-router", () => {
  const React = require("react");
  const Tabs = ({ children }: any) => React.createElement("Tabs", null, children);
  Tabs.Screen = (props: any) => {
    screens.push(props);
    return null;
  };
  return { Tabs };
});

import { render } from "@testing-library/react-native";
import React from "react";
import AppLayout from "../(app)/_layout";

beforeEach(() => {
  screens.length = 0;
});

test("registers the four main tabs in order with their titles", async () => {
  await render(<AppLayout />);
  const visible = screens.filter((s) => s.options?.href !== null);
  expect(visible.map((s) => s.name)).toEqual(["index", "workouts", "history", "library"]);
  expect(visible.map((s) => s.options.title)).toEqual([
    "Padel HIIT",
    "My workouts",
    "History",
    "Exercises",
  ]);
  expect(visible.map((s) => s.options.tabBarLabel)).toEqual([
    "Home",
    "Workouts",
    "History",
    "Browse",
  ]);
});

test("hides builder and player from the tab bar", async () => {
  await render(<AppLayout />);
  const hidden = screens.filter((s) => s.options?.href === null);
  expect(hidden.map((s) => s.name).sort()).toEqual(["builder", "player/[id]"]);
});

test("gives the player no header and no tab bar", async () => {
  await render(<AppLayout />);
  const player = screens.find((s) => s.name === "player/[id]");
  expect(player.options.headerShown).toBe(false);
  expect(player.options.tabBarStyle).toEqual({ display: "none" });
});

test("gives the builder a header so it can be dismissed", async () => {
  await render(<AppLayout />);
  const builder = screens.find((s) => s.name === "builder");
  expect(builder.options.headerShown).toBe(true);
  expect(builder.options.title).toBe("New workout");
});
