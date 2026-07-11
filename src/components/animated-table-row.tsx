"use client"

import { useRef } from "react"
import { motion, useInView } from "motion/react"

export function AnimatedTableRow({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLTableRowElement>(null)
  const inView = useInView(ref, { amount: 0.5, once: false })

  return (
    <motion.tr
      ref={ref}
      initial={{ opacity: 0, scale: 0.7 }}
      animate={inView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.7 }}
      transition={{ duration: 0.2 }}
      className={className}
    >
      {children}
    </motion.tr>
  )
}
