import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				},
				paysme: {
					'gradient-start': 'hsl(var(--paysme-gradient-start))',
					'gradient-end': 'hsl(var(--paysme-gradient-end))',
					'teal': 'hsl(var(--paysme-teal))',
					'teal-dark': 'hsl(var(--paysme-teal-dark))',
					'orange': 'hsl(var(--paysme-orange))',
					'modal-bg': 'hsl(var(--paysme-modal-bg))',
					'modal-content-bg': 'hsl(var(--paysme-modal-content-bg))',
					'green': 'hsl(var(--paysme-green))',
					'blue': 'hsl(var(--paysme-blue))'
				},
				marketing: {
					bg: 'hsl(var(--marketing-bg))',
					'bg-deep': 'hsl(var(--marketing-bg-deep))',
					surface: 'hsl(var(--marketing-surface))',
					yellow: 'hsl(var(--marketing-yellow))',
					'yellow-deep': 'hsl(var(--marketing-yellow-deep))',
					text: 'hsl(var(--marketing-text))',
					muted: 'hsl(var(--marketing-muted))'
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: '0'
					}
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out'
			},
			fontFamily: {
				'handwritten': ['Kalam', 'cursive'],
			},
			backgroundImage: {
				'gradient-professional': 'linear-gradient(180deg, hsl(var(--paysme-gradient-start)), hsl(var(--paysme-gradient-end)))',
				'gradient-subtle': 'linear-gradient(135deg, hsl(var(--paysme-teal)) 0%, hsl(var(--paysme-teal-dark)) 100%)',
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
