const { motion } = window["framer-motion"];

motion.animate(
  "#title",
  { opacity: [0, 1], y: [30, 0] },
  { duration: 0.8 }
);

motion.animate(
  "#subtitle",
  { opacity: [0, 1], y: [20, 0] },
  { delay: 0.3, duration: 0.6 }
);

motion.animate(
  ".actions",
  { opacity: [0, 1], y: [20, 0] },
  { delay: 0.6, duration: 0.6 }
);
