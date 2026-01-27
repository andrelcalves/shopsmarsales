module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      borderRadius: { "2xl": "1.25rem" },
      boxShadow: {
        soft: "0 10px 30px rgba(2, 6, 23, 0.08)",
      },
    },
  },
  plugins: [],
};
