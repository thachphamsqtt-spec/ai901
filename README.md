# Ôn thi Azure AI Fundamentals (AI-900, AI-901)

Web luyện tập/thi thử chạy hoàn toàn phía trình duyệt, cài được lên điện thoại/máy tính như ứng dụng (PWA) và dùng được khi không có mạng.

- 291 câu hỏi (AI-900: 200, AI-901: 91) — dữ liệu từ open-exam-prep.com, chỉ dùng để tự học.
- Tra từ Anh–Việt offline: bật nút tra từ khi làm bài rồi chạm vào từ (máy tính: bôi đen từ).
- Tiến độ lưu trên trình duyệt; chuyển máy bằng **Cài đặt → Xuất/Nhập tiến độ**.

## Cấu trúc

| Đường dẫn | Nội dung |
| --- | --- |
| `web/` | Toàn bộ web (thư mục được deploy) |
| `web/questions.js` | Ngân hàng câu hỏi (sinh bởi script) |
| `web/dictionary.js` | Từ điển offline (sinh bởi script) |
| `web/sw.js` | Service worker cho chế độ offline |
| `data/` | Dữ liệu gốc, `duplicates.json` (câu trùng đã rà), `glossary.json` (thuật ngữ AI) |
| `scripts/` | Script tải câu hỏi, dựng từ điển, tạo icon, chạy server nội bộ |

## Đưa lên GitHub + Vercel

1. Tạo repo mới trên GitHub (nên để **Private**), rồi trong thư mục này chạy:
   ```
   git remote add origin https://github.com/<tài-khoản>/<tên-repo>.git
   git push -u origin main
   ```
2. Vào https://vercel.com → **Add New… → Project** → chọn repo vừa tạo.
3. Ở bước cấu hình: **Framework Preset = Other**, **Root Directory = `web`**, không cần Build Command → **Deploy**.
4. Mỗi lần `git push`, Vercel tự deploy bản mới.

Site có `noindex` nên không bị Google tìm thấy; chỉ người có link mới vào được.

## Cài lên điện thoại / máy tính

Mở link Vercel (https) một lần khi có mạng, sau đó:

- **Android (Chrome):** bấm nút **Cài đặt** trên trang chủ, hoặc menu ⋮ → *Cài đặt ứng dụng*.
- **iPhone/iPad:** mở bằng **Safari** → nút Chia sẻ → *Thêm vào MH chính*.
- **Máy tính (Chrome/Edge):** nút **Cài đặt** trên trang chủ hoặc biểu tượng cài đặt ở thanh địa chỉ.

Từ đó app mở được cả khi không có mạng (mục *Ứng dụng → Dùng khi không có mạng* hiện "Sẵn sàng"). Khi có mạng, app tự lấy bản mới nhất.

## Cập nhật dữ liệu

```
python scripts/fetch_questions.py     # tải lại câu hỏi AI-900 + AI-901, gộp, bỏ câu trùng
python scripts/build_dictionary.py    # dựng lại từ điển theo từ vựng mới
```

Khi thêm/bớt file trong `web/`, sửa danh sách `ASSETS` và tăng `VERSION` trong `web/sw.js`.

Chạy thử trong mạng nội bộ (điện thoại cùng Wi-Fi): `python scripts/serve.py`.

## Nguồn dữ liệu

- Câu hỏi: [open-exam-prep.com](https://open-exam-prep.com) (AI-900, AI-901).
- Từ điển Anh–Việt: Free Vietnamese Dictionary Project (Hồ Ngọc Đức), qua các repo
  [manhminno/English-Vietnamese-Dictionary](https://github.com/manhminno/English-Vietnamese-Dictionary) và
  [DucLoc1999/Dictionary](https://github.com/DucLoc1999/Dictionary).
- Thuật ngữ AI tiếng Việt: `data/glossary.json` (tự soạn).
