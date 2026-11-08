# BlueMoon frontend

React + JavaScript + Tailwind CSS v4 + Vite. Xem [README gốc](../README.md) để cấu hình và chạy full stack.

```powershell
Copy-Item .env.example .env
npm.cmd ci
npm.cmd run dev
```

Build: `npm.cmd run build`; lint: `npm.cmd run lint`.

Tailwind được tích hợp qua `@tailwindcss/vite` và import trong `src/index.css`.
Dùng utility trực tiếp trong JSX, ví dụ: `<div className="flex items-center gap-4">...</div>`.
Không bật Preflight để giữ CSS reset và giao diện hiện có. CSS hiện tại nằm ngoài
cascade layer nên được ưu tiên hơn utility khi cùng định dạng một thuộc tính;
khi chuyển component sang Tailwind, hãy gỡ các quy tắc CSS cũ tương ứng.
