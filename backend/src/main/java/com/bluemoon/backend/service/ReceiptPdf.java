package com.bluemoon.backend.service;

import com.bluemoon.backend.api.*;

import java.io.*;
import java.nio.file.*;
import java.util.*;

import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import static com.bluemoon.backend.api.Values.*;

@Service
public class ReceiptPdf {
    private final String configuredFont;

    public ReceiptPdf(@Value("${app.pdf.font:}") String font) {
        this.configuredFont = font;
    }

    public byte[] render(Map<String, Object> receipt, boolean voided) {
        String fontPath = List.of(configuredFont, "C:/Windows/Fonts/arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf").stream().filter(p -> !p.isBlank() && Files.isRegularFile(Path.of(p))).findFirst().orElseThrow(() -> new ApiException(503, "DEPENDENCY_UNAVAILABLE", "Cấu hình APP_PDF_FONT với font Unicode để xuất biên lai."));
        try (var doc = new PDDocument(); var output = new ByteArrayOutputStream(); var input = Files.newInputStream(Path.of(fontPath))) {
            var font = PDType0Font.load(doc, input, true);
            var snapshot = object(receipt.get("snapshot"));
            var lines = new ArrayList<String>();
            lines.add(voided ? "BIÊN LAI THU TIỀN — HỦY" : "BIÊN LAI THU TIỀN");
            lines.add("Số biên lai: " + snapshot.get("receiptNo"));
            lines.add("Số thanh toán: " + snapshot.get("paymentNo"));
            lines.add("Hộ: " + snapshot.get("householdCode") + " | Căn hộ: " + String.join(",", (List<String>) snapshot.get("apartmentCodes")));
            lines.add("Người nộp: " + snapshot.get("payerDisplayName"));
            lines.add("Ngày thu: " + snapshot.get("paidAt"));
            lines.add("Hình thức: " + snapshot.get("channel"));
            lines.add("Tổng thu: " + snapshot.get("amount") + " VND");
            lines.add("Người ghi nhận: " + Objects.toString(snapshot.get("recordedByDisplayName"), ""));
            lines.add("Chi tiết phân bổ:");
            for (var allocation : objects(snapshot.get("allocations")))
                lines.add(allocation.get("description") + ": " + allocation.get("amount") + " VND");
            List<String> wrapped = new ArrayList<>();
            for (String line : lines) {
                line = line.replaceAll("[\\p{Cntrl}]", " ");
                String current = "";
                for (String word : line.split(" ")) {
                    // Break long unspaced identifiers too; no clipping or implicit truncation.
                    for (int i = 0; i < word.length(); i++) {
                        String next = current + word.charAt(i);
                        if (font.getStringWidth(next) / 1000 * 11 > 480) {
                            wrapped.add(current);
                            current = "";
                        }
                        current += word.charAt(i);
                    }
                    current += " ";
                }
                wrapped.add(current);
            }
            for (int offset = 0; offset < wrapped.size(); offset += 42) {
                var page = new PDPage();
                doc.addPage(page);
                try (var stream = new PDPageContentStream(doc, page)) {
                    stream.beginText();
                    stream.setFont(font, 11);
                    stream.setLeading(16);
                    stream.newLineAtOffset(50, 740);
                    if (voided) {
                        stream.showText("HỦY — Chứng từ không có giá trị ghi nhận thu");
                        stream.newLine();
                    }
                    for (String line : wrapped.subList(offset, Math.min(offset + 42, wrapped.size()))) {
                        stream.showText(line);
                        stream.newLine();
                    }
                    stream.endText();
                }
            }
            doc.save(output);
            return output.toByteArray();
        } catch (IOException | IllegalArgumentException e) {
            throw new ApiException(503, "DEPENDENCY_UNAVAILABLE", "Không thể tạo PDF với font đã cấu hình.");
        }
    }
}
