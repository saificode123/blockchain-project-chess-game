// 1. Import your global CSS file here
// Adjust the path if your globals.css is in a different folder (e.g., ../styles/globals.css)
import "../styles/globals.css";

export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />;
}