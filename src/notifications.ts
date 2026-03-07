type ToastVariant = "success" | "error";

const TOAST_ID = "rgef_toast";

function getBackground(variant: ToastVariant) {
	return variant === "error" ? "#8b1a1a" : "#1f6b3a";
}

export function showToast(message: string, variant: ToastVariant = "success") {
	if (typeof document === "undefined" || !document.body) {
		return;
	}

	const existing = document.getElementById(TOAST_ID);
	if (existing) {
		existing.remove();
	}

	const toast = document.createElement("div");
	toast.id = TOAST_ID;
	toast.textContent = message;
	toast.style.cssText = `
		position: fixed;
		right: 20px;
		bottom: 20px;
		z-index: 10000;
		padding: 10px 14px;
		border-radius: 6px;
		background: ${getBackground(variant)};
		color: #fff;
		font-size: 13px;
		box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
		opacity: 1;
		transition: opacity 0.2s ease;
	`;

	document.body.appendChild(toast);
	window.setTimeout(() => {
		toast.style.opacity = "0";
		window.setTimeout(() => {
			toast.remove();
		}, 220);
	}, 1800);
}
