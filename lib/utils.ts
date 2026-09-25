import clsx, { ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Random number generator built on top of Math.random().
 *
 * @param min The minimum value (inclusive)
 * @param max The maximum value (inclusive)
 * @returns A random number between min and max.
 */
export function random(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Conditional merge of class values.
 *
 * ```ts
 * cn('flex', true && 'p-10', false && 'm-8')
 *   => 'flex p-10'
 *
 * cn({ 'flex': true, 'p-10': false })
 *   => 'flex'
 *
 * cn(['flex', 'p-10'])
 *   => 'flex p-10'
 * ```
 *
 * @param inputs The class values to merge
 * @returns A single class name evaluated from the class values.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns the site URL depending on environment.
 */
export const getSiteUrl = () => {
  const deployEnv = process.env.NEXT_PUBLIC_VERCEL_ENV;

  // no vercel env => local environment, use localhost
  if (!deployEnv) return 'http://localhost:3000/';

  // preview env => use vercel url for same environment testing
  // otherwise, use prod site url
  const siteUrl =
    deployEnv === 'preview'
      ? process.env.NEXT_PUBLIC_VERCEL_URL
      : process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;

  return `https://${siteUrl}/`;
};
