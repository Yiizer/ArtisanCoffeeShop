import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Artisan brand palette — extracted from the logo image
        cream:    "#EDE8DF", // warm page background (logo bg)
        foam:     "#F5F0E8", // card / panel surfaces (lighter cream)
        latte:    "#C4A882", // muted accent, hover fills
        roast:    "#5C3D2E", // secondary text, subtitles, borders
        espresso: "#3D2314", // primary text, active buttons (logo wordmark)
      },
    },
  },
  plugins: [],
};

export default config;
