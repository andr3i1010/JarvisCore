import { ModuleObject } from "../../types";

export const weatherTool: ModuleObject = {
  name: "weather",
  description: "Get the current weather for a specified location.",
  payload: {
    lat: "Latitude of the target location.",
    lon: "Longitude of the target location."
  },
  execute: async (payload: Record<string, any>) => {
    try {
      const latitude = payload.lat as number;
      const longitude = payload.lon as number;

      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`
      );

      if (!response.ok) {
        throw new Error(`OpenMeteo API error: ${response.status}`);
      }

      const data = await response.json();
      return {
        ok: true,
        payload: data,
        output: "Weather OK"
      };
    } catch (error) {
      console.error("Error fetching weather data:", error);
      throw error;
    }
  }
}