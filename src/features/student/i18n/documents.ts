export const en = {
  "documents.upload": "Optional document",
  "documents.formats":
    "PDF, DOC, DOCX, JPG, JPEG or PNG; maximum 10 MiB. A document name alone is valid.",
  "documents.remove": "Remove selected file",
  "documents.removeAttempt": "Remove attempted attachment",
  "documents.previousKept":
    "Replacement failed. Your previous valid attachment remains selected and will be used if you submit.",
  "documents.rejectedNoFile":
    "The new attachment was rejected. Choose a valid replacement or explicitly remove this attempt to continue name-only.",
  "documents.missing":
    "The saved file is unavailable. Reattach it or explicitly remove it before submitting.",
  "documents.reattach":
    "Choose the file again, or remove the missing attachment.",
  "documents.replace":
    "Choose a supported file with matching contents and format.",
  "documents.invalidName":
    "The filename is missing, too long or contains invalid characters.",
  "documents.empty": "Empty files cannot be attached.",
  "documents.tooLarge": "The file exceeds the 10 MiB limit.",
  "documents.unsupported": "This file extension is not supported.",
  "documents.mimeMismatch":
    "The declared file type does not match its extension.",
  "documents.signatureMismatch":
    "The file contents do not match the selected format.",
  "documents.invalidDocx":
    "The DOCX ZIP structure is invalid, encrypted, unsupported or missing required Word parts.",
  "documents.readError": "The file could not be read. Try selecting it again.",
  "documents.checking": "Checking the selected file…",
  "documents.quality": "Document quality checklist",
  "documents.pass": "Checked",
  "documents.warning": "Review",
  "documents.error": "Correction required",
  "documents.notApplicable": "Not performed",
  "documents.correctFields": "Correct the indicated print fields above.",
  "documents.fieldsValid":
    "Required information, copies, pages, mode, sidedness and A4 settings are valid.",
  "documents.nameOnly":
    "No attachment selected. A name-only print request is valid; no file is delivered.",
  "documents.formatValid":
    "{format} extension, declared MIME and supported format checks match.",
  "documents.sizeValid": "File size is nonzero and within 10 MiB.",
  "documents.pdfLimits":
    "Only the PDF header was checked. Full structure, page count and encryption were not analysed.",
  "documents.officePreview":
    "Word preview is unavailable. Download and review the original file.",
  "documents.verifyOriginal":
    "Open the original in a trusted application and verify it before printing.",
  "documents.resolution":
    "{width} × {height} pixels; approximately {dpi} DPI for full-A4 portrait placement. This is not a print-quality guarantee.",
  "documents.higherResolution":
    "Below 150 DPI: consider a higher-resolution image or smaller placement.",
  "documents.decodeUnavailable":
    "Image dimensions/preview could not be decoded; signature checking is not a full image integrity check.",
  "documents.preview.dimensions-exceed-limit":
    "Automatic image decoding and preview were not performed: the header exceeds {maxPixels} pixels or {maxEdge} pixels per edge. The original remains attached and downloadable; image quality was not assessed.",
  "documents.preview.dimensions-unavailable":
    "Automatic image decoding and preview were not performed because safe dimensions could not be read from a bounded PNG/JPEG header check. The original remains attached and downloadable; image quality was not assessed.",
  "documents.preview.decode-unavailable":
    "Browser image decoding was unavailable or did not match the bounded header dimensions. Automatic preview is disabled; the original remains attached and downloadable, without a print-quality assessment.",
  "documents.assumedPages":
    "Page count is assumed, not detected from this file.",
  "documents.manualPages":
    "Page count was entered manually, not independently verified.",
  "documents.imagePage": "One image is treated as one print page.",
  "documents.verifyPages":
    "Verify the actual page count, especially after replacing a file.",
  "documents.noScan":
    "No malware scan or comprehensive document safety analysis is performed.",
  "documents.fileInfo": "{name} · {bytes} bytes · {type}",
  "documents.view": "Attached document",
  "documents.noFile": "This job has no attached document.",
  "documents.unavailable":
    "The document is unavailable on this device or from the connected service. The token and job remain usable.",
  "documents.deviceOnly":
    "Device-only file: stored in this browser, not delivered to a shop.",
  "documents.sharedFile":
    "The connected service reports a shared document reference.",
  "documents.download": "Download original document",
  "documents.previewTitle": "Document preview",
  "documents.pdfPreview":
    "Sandboxed PDF preview may be unavailable in this browser. A frame loading does not confirm rendering; use Download if blank.",
  "documents.retry": "Retry",
  "documents.loading": "Loading…",
  "documents.qrTitle": "Pickup token and QR",
  "documents.qrUnavailable":
    "A shop-approved QR codec is unavailable. Use the readable token; scanner compatibility is not claimed.",
  "documents.qrFailed":
    "QR rendering or export failed. The readable token remains valid; retry or print the token.",
  "documents.qrLabel": "QR code for pickup token {token}",
  "documents.tokenLabel": "Pickup token",
  "documents.copy": "Copy token",
  "documents.copied": "Token copied.",
  "documents.manualCopy":
    "Automatic copying is unavailable. Select the token and copy it manually.",
  "documents.downloadQr": "Download QR SVG",
  "documents.printToken": "Print token",
  "documents.pickupInstructions":
    "Show this token at pickup. A QR/token identifies the request; it is not payment, authentication or permission to collect.",
  "documents.pickupTitle": "Pickup details",
  "documents.notFound": "This job was not found.",
  "documents.backJobs": "Back to My Jobs",
  "documents.receipt": "Order acknowledgment",
  "documents.disclaimer":
    "Order acknowledgment and price estimate — not proof of payment.",
  "documents.localShop": "Campus Demo Print Desk (fictional)",
  "documents.shopUnavailable": "Shop name unavailable",
  "documents.shopProvided": "Shop-provided name (original language)",
  "documents.documentName": "Document",
  "documents.pages": "Pages",
  "documents.copies": "Copies",
  "documents.mode": "Print mode",
  "documents.bw": "Black & white",
  "documents.colour": "Colour",
  "documents.sidedness": "Sidedness",
  "documents.duplex": "Double-sided",
  "documents.simplex": "Single-sided",
  "documents.cost": "Estimated price",
  "documents.submitted": "Submitted",
  "documents.status": "Current status",
  "documents.queued": "Queued",
  "documents.printing": "Printing",
  "documents.ready": "Ready for pickup",
  "documents.collected": "Collected",
  "documents.eta": "Estimated ready time",
  "documents.printReceipt": "Print receipt",
  "documents.savePdf": "Save as PDF",
  "documents.pdfInstructions":
    "This opens the browser print dialog. Select a PDF destination to save a PDF; cancelling does not save or print anything.",
  "documents.printError":
    "The print sheet could not be opened. Please retry. Your token and order are unchanged.",
  "documents.unknown": "Unavailable",
  "documents.viewReceipt": "View receipt",
} as const;
export const hi: Record<keyof typeof en, string> = {
  "documents.upload": "वैकल्पिक दस्तावेज़",
  "documents.formats":
    "PDF, DOC, DOCX, JPG, JPEG या PNG; अधिकतम 10 MiB। केवल दस्तावेज़ का नाम भी मान्य है।",
  "documents.remove": "चुनी हुई फ़ाइल हटाएँ",
  "documents.removeAttempt": "असफल संलग्नक प्रयास हटाएँ",
  "documents.previousKept":
    "फ़ाइल बदलना विफल हुआ। पिछला मान्य संलग्नक चुना हुआ है और भेजने पर वही उपयोग होगा।",
  "documents.rejectedNoFile":
    "नया संलग्नक अस्वीकार हुआ। मान्य फ़ाइल चुनें या केवल नाम से जारी रखने के लिए यह प्रयास स्पष्ट रूप से हटाएँ।",
  "documents.missing":
    "सहेजी गई फ़ाइल उपलब्ध नहीं है। भेजने से पहले फिर जोड़ें या स्पष्ट रूप से हटाएँ।",
  "documents.reattach": "फ़ाइल फिर चुनें, या गायब संलग्नक हटाएँ।",
  "documents.replace": "समर्थित प्रारूप और उससे मेल खाती सामग्री वाली फ़ाइल चुनें।",
  "documents.invalidName": "फ़ाइल का नाम गायब, बहुत लंबा या अमान्य वर्णों वाला है।",
  "documents.empty": "खाली फ़ाइल नहीं जोड़ी जा सकती।",
  "documents.tooLarge": "फ़ाइल 10 MiB की सीमा से बड़ी है।",
  "documents.unsupported": "इस फ़ाइल एक्सटेंशन का समर्थन नहीं है।",
  "documents.mimeMismatch": "बताया गया फ़ाइल प्रकार उसके एक्सटेंशन से मेल नहीं खाता।",
  "documents.signatureMismatch": "फ़ाइल की सामग्री चुने हुए प्रारूप से मेल नहीं खाती।",
  "documents.invalidDocx":
    "DOCX ZIP संरचना अमान्य, एन्क्रिप्टेड, असमर्थित या आवश्यक Word भागों के बिना है।",
  "documents.readError": "फ़ाइल पढ़ी नहीं जा सकी। फिर चुनें।",
  "documents.checking": "चुनी फ़ाइल जाँची जा रही है…",
  "documents.quality": "दस्तावेज़ गुणवत्ता जाँच सूची",
  "documents.pass": "जाँचा गया",
  "documents.warning": "समीक्षा करें",
  "documents.error": "सुधार आवश्यक",
  "documents.notApplicable": "नहीं किया गया",
  "documents.correctFields": "ऊपर बताए गए प्रिंट विवरण सुधारें।",
  "documents.fieldsValid":
    "आवश्यक जानकारी, प्रतियाँ, पृष्ठ, मोड, दोनों तरफ़ और A4 सेटिंग मान्य हैं।",
  "documents.nameOnly":
    "कोई संलग्नक नहीं चुना। केवल नाम का अनुरोध मान्य है; कोई फ़ाइल नहीं भेजी जाती।",
  "documents.formatValid":
    "{format} एक्सटेंशन, घोषित MIME और समर्थित प्रारूप की जाँच मेल खाते हैं।",
  "documents.sizeValid": "फ़ाइल खाली नहीं है और 10 MiB के भीतर है।",
  "documents.pdfLimits":
    "केवल PDF हेडर जाँचा गया। पूरी संरचना, पृष्ठ संख्या और एन्क्रिप्शन का विश्लेषण नहीं हुआ।",
  "documents.officePreview":
    "Word पूर्वावलोकन उपलब्ध नहीं है। मूल फ़ाइल डाउनलोड करके जाँचें।",
  "documents.verifyOriginal": "विश्वसनीय ऐप में मूल फ़ाइल खोलकर प्रिंट से पहले जाँचें।",
  "documents.resolution":
    "{width} × {height} पिक्सेल; पूरे A4 पोर्ट्रेट पर लगभग {dpi} DPI। यह प्रिंट गुणवत्ता की गारंटी नहीं है।",
  "documents.higherResolution": "150 DPI से कम: बेहतर रिज़ॉल्यूशन या छोटा आकार चुनें।",
  "documents.decodeUnavailable":
    "छवि के आयाम/पूर्वावलोकन पढ़े नहीं जा सके; हस्ताक्षर जाँच पूरी छवि अखंडता जाँच नहीं है।",
  "documents.preview.dimensions-exceed-limit":
    "स्वतः छवि डिकोडिंग और पूर्वावलोकन नहीं किए गए: हेडर में {maxPixels} से अधिक पिक्सेल या किसी किनारे पर {maxEdge} से अधिक पिक्सेल हैं। मूल फ़ाइल संलग्न और डाउनलोड योग्य है; छवि गुणवत्ता नहीं जाँची गई।",
  "documents.preview.dimensions-unavailable":
    "सीमित PNG/JPEG हेडर जाँच से सुरक्षित आयाम नहीं पढ़े जा सके, इसलिए स्वतः डिकोडिंग और पूर्वावलोकन नहीं किए गए। मूल फ़ाइल संलग्न और डाउनलोड योग्य है; छवि गुणवत्ता नहीं जाँची गई।",
  "documents.preview.decode-unavailable":
    "ब्राउज़र में छवि डिकोडिंग उपलब्ध नहीं थी या आयाम सीमित हेडर से मेल नहीं खाते। स्वतः पूर्वावलोकन बंद है; मूल फ़ाइल संलग्न और डाउनलोड योग्य है, बिना प्रिंट गुणवत्ता जाँच के।",
  "documents.assumedPages": "पृष्ठ संख्या अनुमानित है, फ़ाइल से पता नहीं की गई।",
  "documents.manualPages": "पृष्ठ संख्या हाथ से दर्ज की गई है, स्वतंत्र जाँच नहीं हुई।",
  "documents.imagePage": "एक छवि को एक प्रिंट पृष्ठ माना जाता है।",
  "documents.verifyPages": "विशेषकर फ़ाइल बदलने पर वास्तविक पृष्ठ संख्या जाँचें।",
  "documents.noScan": "मैलवेयर स्कैन या संपूर्ण दस्तावेज़ सुरक्षा विश्लेषण नहीं किया जाता।",
  "documents.fileInfo": "{name} · {bytes} बाइट · {type}",
  "documents.view": "संलग्न दस्तावेज़",
  "documents.noFile": "इस कार्य में कोई दस्तावेज़ संलग्न नहीं है।",
  "documents.unavailable":
    "दस्तावेज़ इस डिवाइस या जुड़ी सेवा पर उपलब्ध नहीं है। टोकन और कार्य उपयोगी रहते हैं।",
  "documents.deviceOnly":
    "केवल डिवाइस की फ़ाइल: इस ब्राउज़र में संग्रहीत, दुकान को नहीं भेजी गई।",
  "documents.sharedFile": "जुड़ी सेवा साझा दस्तावेज़ संदर्भ बताती है।",
  "documents.download": "मूल दस्तावेज़ डाउनलोड करें",
  "documents.previewTitle": "दस्तावेज़ पूर्वावलोकन",
  "documents.pdfPreview":
    "इस ब्राउज़र में सैंडबॉक्स PDF पूर्वावलोकन उपलब्ध न हो। फ़्रेम लोड होना प्रदर्शन की पुष्टि नहीं है; खाली होने पर डाउनलोड करें।",
  "documents.retry": "फिर प्रयास करें",
  "documents.loading": "लोड हो रहा है…",
  "documents.qrTitle": "पिकअप टोकन और QR",
  "documents.qrUnavailable":
    "दुकान द्वारा स्वीकृत QR कोडेक उपलब्ध नहीं है। पढ़ने योग्य टोकन प्रयोग करें; स्कैनर अनुकूलता का दावा नहीं है।",
  "documents.qrFailed":
    "QR प्रदर्शन या निर्यात विफल हुआ। पढ़ने योग्य टोकन मान्य है; फिर प्रयास करें या टोकन प्रिंट करें।",
  "documents.qrLabel": "पिकअप टोकन {token} का QR कोड",
  "documents.tokenLabel": "पिकअप टोकन",
  "documents.copy": "टोकन कॉपी करें",
  "documents.copied": "टोकन कॉपी हुआ।",
  "documents.manualCopy": "स्वतः कॉपी उपलब्ध नहीं है। टोकन चुनकर हाथ से कॉपी करें।",
  "documents.downloadQr": "QR SVG डाउनलोड करें",
  "documents.printToken": "टोकन प्रिंट करें",
  "documents.pickupInstructions":
    "पिकअप पर यह टोकन दिखाएँ। QR/टोकन अनुरोध की पहचान है; भुगतान, प्रमाणीकरण या लेने की अनुमति नहीं।",
  "documents.pickupTitle": "पिकअप विवरण",
  "documents.notFound": "यह कार्य नहीं मिला।",
  "documents.backJobs": "मेरे कार्यों पर लौटें",
  "documents.receipt": "ऑर्डर पावती",
  "documents.disclaimer": "ऑर्डर पावती और मूल्य अनुमान — भुगतान का प्रमाण नहीं।",
  "documents.localShop": "कैंपस डेमो प्रिंट डेस्क (काल्पनिक)",
  "documents.shopUnavailable": "दुकान का नाम उपलब्ध नहीं",
  "documents.shopProvided": "दुकान द्वारा दिया नाम (मूल भाषा)",
  "documents.documentName": "दस्तावेज़",
  "documents.pages": "पृष्ठ",
  "documents.copies": "प्रतियाँ",
  "documents.mode": "प्रिंट मोड",
  "documents.bw": "श्वेत-श्याम",
  "documents.colour": "रंगीन",
  "documents.sidedness": "पृष्ठ की तरफ़ें",
  "documents.duplex": "दोनों तरफ़",
  "documents.simplex": "एक तरफ़",
  "documents.cost": "अनुमानित मूल्य",
  "documents.submitted": "जमा किया",
  "documents.status": "वर्तमान स्थिति",
  "documents.queued": "कतार में",
  "documents.printing": "प्रिंट हो रहा है",
  "documents.ready": "पिकअप के लिए तैयार",
  "documents.collected": "ले लिया गया",
  "documents.eta": "अनुमानित तैयार समय",
  "documents.printReceipt": "रसीद प्रिंट करें",
  "documents.savePdf": "PDF के रूप में सहेजें",
  "documents.pdfInstructions":
    "इससे ब्राउज़र का प्रिंट संवाद खुलेगा। PDF सहेजने के लिए PDF गंतव्य चुनें; रद्द करने पर कुछ सहेजा या प्रिंट नहीं होता।",
  "documents.printError":
    "प्रिंट पृष्ठ नहीं खुल सका। फिर प्रयास करें। टोकन और ऑर्डर नहीं बदले हैं।",
  "documents.unknown": "अनुपलब्ध",
  "documents.viewReceipt": "रसीद देखें",
};
export const kn: Record<keyof typeof en, string> = {
  "documents.upload": "ಐಚ್ಛಿಕ ದಾಖಲೆ",
  "documents.formats":
    "PDF, DOC, DOCX, JPG, JPEG ಅಥವಾ PNG; ಗರಿಷ್ಠ 10 MiB. ದಾಖಲೆಯ ಹೆಸರು ಮಾತ್ರವೂ ಮಾನ್ಯ.",
  "documents.remove": "ಆಯ್ದ ಕಡತ ತೆಗೆಯಿರಿ",
  "documents.removeAttempt": "ಪ್ರಯತ್ನಿಸಿದ ಲಗತ್ತು ತೆಗೆಯಿರಿ",
  "documents.previousKept":
    "ಬದಲಾವಣೆ ವಿಫಲವಾಗಿದೆ. ಹಿಂದಿನ ಮಾನ್ಯ ಲಗತ್ತೇ ಆಯ್ಕೆಯಲ್ಲಿದೆ ಮತ್ತು ಸಲ್ಲಿಸಿದರೆ ಅದನ್ನೇ ಬಳಸಲಾಗುತ್ತದೆ.",
  "documents.rejectedNoFile":
    "ಹೊಸ ಲಗತ್ತನ್ನು ತಿರಸ್ಕರಿಸಲಾಗಿದೆ. ಮಾನ್ಯ ಕಡತ ಆಯ್ಕೆಮಾಡಿ ಅಥವಾ ಹೆಸರು ಮಾತ್ರದ ವಿನಂತಿಗೆ ಈ ಪ್ರಯತ್ನವನ್ನು ಸ್ಪಷ್ಟವಾಗಿ ತೆಗೆಯಿರಿ.",
  "documents.missing":
    "ಉಳಿಸಿದ ಕಡತ ಲಭ್ಯವಿಲ್ಲ. ಸಲ್ಲಿಸುವ ಮೊದಲು ಮತ್ತೆ ಸೇರಿಸಿ ಅಥವಾ ಸ್ಪಷ್ಟವಾಗಿ ತೆಗೆದುಹಾಕಿ.",
  "documents.reattach": "ಕಡತವನ್ನು ಮತ್ತೆ ಆಯ್ಕೆಮಾಡಿ ಅಥವಾ ಕಾಣೆಯಾದ ಲಗತ್ತನ್ನು ತೆಗೆಯಿರಿ.",
  "documents.replace": "ಹೊಂದುವ ವಿಷಯ ಮತ್ತು ಸ್ವರೂಪದ ಬೆಂಬಲಿತ ಕಡತ ಆಯ್ಕೆಮಾಡಿ.",
  "documents.invalidName":
    "ಕಡತದ ಹೆಸರು ಇಲ್ಲ, ತುಂಬಾ ಉದ್ದವಾಗಿದೆ ಅಥವಾ ಅಮಾನ್ಯ ಅಕ್ಷರಗಳನ್ನು ಹೊಂದಿದೆ.",
  "documents.empty": "ಖಾಲಿ ಕಡತಗಳನ್ನು ಸೇರಿಸಲಾಗುವುದಿಲ್ಲ.",
  "documents.tooLarge": "ಕಡತವು 10 MiB ಮಿತಿಯನ್ನು ಮೀರಿದೆ.",
  "documents.unsupported": "ಈ ಕಡತ ವಿಸ್ತರಣೆಗೆ ಬೆಂಬಲವಿಲ್ಲ.",
  "documents.mimeMismatch": "ಘೋಷಿಸಿದ ಕಡತ ಪ್ರಕಾರವು ಅದರ ವಿಸ್ತರಣೆಗೆ ಹೊಂದುವುದಿಲ್ಲ.",
  "documents.signatureMismatch": "ಕಡತದ ವಿಷಯವು ಆಯ್ದ ಸ್ವರೂಪಕ್ಕೆ ಹೊಂದುವುದಿಲ್ಲ.",
  "documents.invalidDocx":
    "DOCX ZIP ರಚನೆ ಅಮಾನ್ಯ, ಗೂಢಲಿಪೀಕರಿಸಿದ, ಬೆಂಬಲವಿಲ್ಲದ ಅಥವಾ ಅಗತ್ಯ Word ಭಾಗಗಳಿಲ್ಲದ್ದು.",
  "documents.readError": "ಕಡತ ಓದಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಆಯ್ಕೆಮಾಡಿ.",
  "documents.checking": "ಆಯ್ದ ಕಡತ ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ…",
  "documents.quality": "ದಾಖಲೆ ಗುಣಮಟ್ಟದ ಪರಿಶೀಲನಾ ಪಟ್ಟಿ",
  "documents.pass": "ಪರಿಶೀಲಿಸಲಾಗಿದೆ",
  "documents.warning": "ಪರಿಶೀಲಿಸಿ",
  "documents.error": "ತಿದ್ದುಪಡಿ ಅಗತ್ಯ",
  "documents.notApplicable": "ನಡೆಸಿಲ್ಲ",
  "documents.correctFields": "ಮೇಲಿನ ಮುದ್ರಣ ವಿವರಗಳನ್ನು ಸರಿಪಡಿಸಿ.",
  "documents.fieldsValid":
    "ಅಗತ್ಯ ಮಾಹಿತಿ, ಪ್ರತಿಗಳು, ಪುಟಗಳು, ಕ್ರಮ, ಬದಿಗಳು ಮತ್ತು A4 ಆಯ್ಕೆಗಳು ಮಾನ್ಯವಾಗಿವೆ.",
  "documents.nameOnly":
    "ಲಗತ್ತು ಆಯ್ಕೆಯಾಗಿಲ್ಲ. ಹೆಸರು ಮಾತ್ರದ ವಿನಂತಿ ಮಾನ್ಯ; ಯಾವುದೇ ಕಡತ ಕಳುಹಿಸಲಾಗುವುದಿಲ್ಲ.",
  "documents.formatValid":
    "{format} ವಿಸ್ತರಣೆ, ಘೋಷಿತ MIME ಮತ್ತು ಬೆಂಬಲಿತ ಸ್ವರೂಪ ಪರಿಶೀಲನೆಗಳು ಹೊಂದಿವೆ.",
  "documents.sizeValid": "ಕಡತ ಖಾಲಿಯಿಲ್ಲ ಮತ್ತು 10 MiB ಒಳಗಿದೆ.",
  "documents.pdfLimits":
    "PDF ಹೆಡರ್ ಮಾತ್ರ ಪರಿಶೀಲಿಸಲಾಗಿದೆ. ಸಂಪೂರ್ಣ ರಚನೆ, ಪುಟಸಂಖ್ಯೆ ಮತ್ತು ಗೂಢಲಿಪೀಕರಣ ವಿಶ್ಲೇಷಿಸಿಲ್ಲ.",
  "documents.officePreview": "Word ಮುನ್ನೋಟ ಲಭ್ಯವಿಲ್ಲ. ಮೂಲ ಕಡತ ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ ಪರಿಶೀಲಿಸಿ.",
  "documents.verifyOriginal":
    "ವಿಶ್ವಾಸಾರ್ಹ ಅಪ್ಲಿಕೇಶನ್‌ನಲ್ಲಿ ಮೂಲ ಕಡತ ತೆರೆದು ಮುದ್ರಣದ ಮೊದಲು ಪರಿಶೀಲಿಸಿ.",
  "documents.resolution":
    "{width} × {height} ಪಿಕ್ಸೆಲ್‌ಗಳು; ಪೂರ್ಣ A4 ಲಂಬ ಜೋಡಣೆಯಲ್ಲಿ ಸುಮಾರು {dpi} DPI. ಇದು ಮುದ್ರಣ ಗುಣಮಟ್ಟದ ಖಾತರಿಯಲ್ಲ.",
  "documents.higherResolution":
    "150 DPI ಗಿಂತ ಕಡಿಮೆ: ಹೆಚ್ಚಿನ ರೆಸಲ್ಯೂಶನ್ ಅಥವಾ ಚಿಕ್ಕ ಜೋಡಣೆ ಬಳಸಿ.",
  "documents.decodeUnavailable":
    "ಚಿತ್ರದ ಅಳತೆ/ಮುನ್ನೋಟ ಓದಲಾಗಲಿಲ್ಲ; ಗುರುತು ಪರಿಶೀಲನೆ ಪೂರ್ಣ ಚಿತ್ರ ಸಮಗ್ರತೆಯ ಪರೀಕ್ಷೆಯಲ್ಲ.",
  "documents.preview.dimensions-exceed-limit":
    "ಸ್ವಯಂ ಚಿತ್ರ ಡಿಕೋಡಿಂಗ್ ಮತ್ತು ಮುನ್ನೋಟ ನಡೆಸಿಲ್ಲ: ಹೆಡರ್‌ನಲ್ಲಿ {maxPixels} ಪಿಕ್ಸೆಲ್‌ಗಳಿಗಿಂತ ಹೆಚ್ಚು ಅಥವಾ ಪ್ರತಿ ಅಂಚಿನಲ್ಲಿ {maxEdge} ಪಿಕ್ಸೆಲ್‌ಗಳಿಗಿಂತ ಹೆಚ್ಚಿದೆ. ಮೂಲ ಕಡತ ಲಗತ್ತಾಗಿದೆ ಮತ್ತು ಡೌನ್‌ಲೋಡ್ ಮಾಡಬಹುದು; ಚಿತ್ರದ ಗುಣಮಟ್ಟ ಪರಿಶೀಲಿಸಿಲ್ಲ.",
  "documents.preview.dimensions-unavailable":
    "ಮಿತಿಗೊಳಿಸಿದ PNG/JPEG ಹೆಡರ್ ಪರಿಶೀಲನೆಯಿಂದ ಸುರಕ್ಷಿತ ಅಳತೆಗಳನ್ನು ಓದಲಾಗದ ಕಾರಣ ಸ್ವಯಂ ಡಿಕೋಡಿಂಗ್ ಮತ್ತು ಮುನ್ನೋಟ ನಡೆಸಿಲ್ಲ. ಮೂಲ ಕಡತ ಲಗತ್ತಾಗಿದೆ ಮತ್ತು ಡೌನ್‌ಲೋಡ್ ಮಾಡಬಹುದು; ಚಿತ್ರದ ಗುಣಮಟ್ಟ ಪರಿಶೀಲಿಸಿಲ್ಲ.",
  "documents.preview.decode-unavailable":
    "ಬ್ರೌಸರ್ ಚಿತ್ರ ಡಿಕೋಡಿಂಗ್ ಲಭ್ಯವಿಲ್ಲ ಅಥವಾ ಅಳತೆಗಳು ಮಿತಿಗೊಳಿಸಿದ ಹೆಡರ್‌ಗೆ ಹೊಂದಲಿಲ್ಲ. ಸ್ವಯಂ ಮುನ್ನೋಟ ನಿಷ್ಕ್ರಿಯವಾಗಿದೆ; ಮೂಲ ಕಡತ ಲಗತ್ತಾಗಿದೆ ಮತ್ತು ಡೌನ್‌ಲೋಡ್ ಮಾಡಬಹುದು, ಮುದ್ರಣ ಗುಣಮಟ್ಟದ ಪರಿಶೀಲನೆಯಿಲ್ಲದೆ.",
  "documents.assumedPages": "ಪುಟಸಂಖ್ಯೆ ಊಹಿತವಾಗಿದೆ, ಕಡತದಿಂದ ಕಂಡುಹಿಡಿದಿಲ್ಲ.",
  "documents.manualPages": "ಪುಟಸಂಖ್ಯೆಯನ್ನು ಕೈಯಾರೆ ನೀಡಲಾಗಿದೆ, ಸ್ವತಂತ್ರ ಪರಿಶೀಲನೆಯಾಗಿಲ್ಲ.",
  "documents.imagePage": "ಒಂದು ಚಿತ್ರವನ್ನು ಒಂದು ಮುದ್ರಣ ಪುಟವೆಂದು ಪರಿಗಣಿಸಲಾಗುತ್ತದೆ.",
  "documents.verifyPages": "ವಿಶೇಷವಾಗಿ ಕಡತ ಬದಲಿಸಿದ ನಂತರ ನಿಜವಾದ ಪುಟಸಂಖ್ಯೆ ಪರಿಶೀಲಿಸಿ.",
  "documents.noScan":
    "ಮಾಲ್‌ವೇರ್ ಸ್ಕ್ಯಾನ್ ಅಥವಾ ಸಂಪೂರ್ಣ ದಾಖಲೆ ಸುರಕ್ಷತಾ ವಿಶ್ಲೇಷಣೆ ನಡೆಸುವುದಿಲ್ಲ.",
  "documents.fileInfo": "{name} · {bytes} ಬೈಟ್‌ಗಳು · {type}",
  "documents.view": "ಲಗತ್ತಿಸಿದ ದಾಖಲೆ",
  "documents.noFile": "ಈ ಕೆಲಸಕ್ಕೆ ದಾಖಲೆ ಲಗತ್ತಿಸಿಲ್ಲ.",
  "documents.unavailable":
    "ದಾಖಲೆಯು ಈ ಸಾಧನ ಅಥವಾ ಸಂಪರ್ಕಿತ ಸೇವೆಯಲ್ಲಿ ಲಭ್ಯವಿಲ್ಲ. ಟೋಕನ್ ಮತ್ತು ಕೆಲಸ ಬಳಸಬಹುದು.",
  "documents.deviceOnly":
    "ಸಾಧನದಲ್ಲೇ ಇರುವ ಕಡತ: ಈ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಸಂಗ್ರಹಿತ, ಅಂಗಡಿಗೆ ಕಳುಹಿಸಿಲ್ಲ.",
  "documents.sharedFile": "ಸಂಪರ್ಕಿತ ಸೇವೆ ಹಂಚಿದ ದಾಖಲೆಯ ಉಲ್ಲೇಖವನ್ನು ವರದಿ ಮಾಡಿದೆ.",
  "documents.download": "ಮೂಲ ದಾಖಲೆ ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ",
  "documents.previewTitle": "ದಾಖಲೆ ಮುನ್ನೋಟ",
  "documents.pdfPreview":
    "ಈ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಸ್ಯಾಂಡ್‌ಬಾಕ್ಸ್ PDF ಮುನ್ನೋಟ ಲಭ್ಯವಿಲ್ಲದಿರಬಹುದು. ಫ್ರೇಮ್ ಲೋಡ್ ಆಗುವುದು ಪ್ರದರ್ಶನದ ಖಚಿತತೆಯಲ್ಲ; ಖಾಲಿಯಾಗಿದ್ದರೆ ಡೌನ್‌ಲೋಡ್ ಬಳಸಿ.",
  "documents.retry": "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ",
  "documents.loading": "ಲೋಡ್ ಆಗುತ್ತಿದೆ…",
  "documents.qrTitle": "ಪಿಕಪ್ ಟೋಕನ್ ಮತ್ತು QR",
  "documents.qrUnavailable":
    "ಅಂಗಡಿ ಅನುಮೋದಿತ QR ಕೋಡೆಕ್ ಲಭ್ಯವಿಲ್ಲ. ಓದಬಹುದಾದ ಟೋಕನ್ ಬಳಸಿ; ಸ್ಕ್ಯಾನರ್ ಹೊಂದಾಣಿಕೆಯ ಹೇಳಿಕೆ ಇಲ್ಲ.",
  "documents.qrFailed":
    "QR ಪ್ರದರ್ಶನ ಅಥವಾ ರಫ್ತು ವಿಫಲವಾಗಿದೆ. ಓದಬಹುದಾದ ಟೋಕನ್ ಮಾನ್ಯ; ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ ಅಥವಾ ಟೋಕನ್ ಮುದ್ರಿಸಿ.",
  "documents.qrLabel": "ಪಿಕಪ್ ಟೋಕನ್ {token} ಗಾಗಿ QR ಸಂಕೇತ",
  "documents.tokenLabel": "ಪಿಕಪ್ ಟೋಕನ್",
  "documents.copy": "ಟೋಕನ್ ನಕಲಿಸಿ",
  "documents.copied": "ಟೋಕನ್ ನಕಲಾಗಿದೆ.",
  "documents.manualCopy": "ಸ್ವಯಂ ನಕಲು ಲಭ್ಯವಿಲ್ಲ. ಟೋಕನ್ ಆಯ್ದು ಕೈಯಾರೆ ನಕಲಿಸಿ.",
  "documents.downloadQr": "QR SVG ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ",
  "documents.printToken": "ಟೋಕನ್ ಮುದ್ರಿಸಿ",
  "documents.pickupInstructions":
    "ಪಿಕಪ್ ಸಮಯದಲ್ಲಿ ಈ ಟೋಕನ್ ತೋರಿಸಿ. QR/ಟೋಕನ್ ವಿನಂತಿಯ ಗುರುತು; ಪಾವತಿ, ದೃಢೀಕರಣ ಅಥವಾ ಸಂಗ್ರಹಿಸುವ ಅನುಮತಿಯಲ್ಲ.",
  "documents.pickupTitle": "ಪಿಕಪ್ ವಿವರಗಳು",
  "documents.notFound": "ಈ ಕೆಲಸ ಕಂಡುಬಂದಿಲ್ಲ.",
  "documents.backJobs": "ನನ್ನ ಕೆಲಸಗಳಿಗೆ ಹಿಂತಿರುಗಿ",
  "documents.receipt": "ಆರ್ಡರ್ ಸ್ವೀಕೃತಿ",
  "documents.disclaimer": "ಆರ್ಡರ್ ಸ್ವೀಕೃತಿ ಮತ್ತು ಬೆಲೆ ಅಂದಾಜು — ಪಾವತಿಯ ಪುರಾವೆಯಲ್ಲ.",
  "documents.localShop": "ಕ್ಯಾಂಪಸ್ ಡೆಮೋ ಪ್ರಿಂಟ್ ಡೆಸ್ಕ್ (ಕಾಲ್ಪನಿಕ)",
  "documents.shopUnavailable": "ಅಂಗಡಿಯ ಹೆಸರು ಲಭ್ಯವಿಲ್ಲ",
  "documents.shopProvided": "ಅಂಗಡಿ ನೀಡಿದ ಹೆಸರು (ಮೂಲ ಭಾಷೆ)",
  "documents.documentName": "ದಾಖಲೆ",
  "documents.pages": "ಪುಟಗಳು",
  "documents.copies": "ಪ್ರತಿಗಳು",
  "documents.mode": "ಮುದ್ರಣ ಕ್ರಮ",
  "documents.bw": "ಕಪ್ಪು ಬಿಳುಪು",
  "documents.colour": "ಬಣ್ಣ",
  "documents.sidedness": "ಮುದ್ರಣ ಬದಿಗಳು",
  "documents.duplex": "ಎರಡೂ ಬದಿ",
  "documents.simplex": "ಒಂದು ಬದಿ",
  "documents.cost": "ಅಂದಾಜು ಬೆಲೆ",
  "documents.submitted": "ಸಲ್ಲಿಸಿದ್ದು",
  "documents.status": "ಪ್ರಸ್ತುತ ಸ್ಥಿತಿ",
  "documents.queued": "ಸರದಿಯಲ್ಲಿದೆ",
  "documents.printing": "ಮುದ್ರಿಸಲಾಗುತ್ತಿದೆ",
  "documents.ready": "ಪಿಕಪ್‌ಗೆ ಸಿದ್ಧ",
  "documents.collected": "ಪಡೆದುಕೊಳ್ಳಲಾಗಿದೆ",
  "documents.eta": "ಅಂದಾಜು ಸಿದ್ಧ ಸಮಯ",
  "documents.printReceipt": "ರಸೀದಿ ಮುದ್ರಿಸಿ",
  "documents.savePdf": "PDF ಆಗಿ ಉಳಿಸಿ",
  "documents.pdfInstructions":
    "ಇದು ಬ್ರೌಸರ್ ಮುದ್ರಣ ಸಂವಾದ ತೆರೆಯುತ್ತದೆ. PDF ಉಳಿಸಲು PDF ಗಮ್ಯಸ್ಥಾನ ಆಯ್ಕೆಮಾಡಿ; ರದ್ದು ಮಾಡಿದರೆ ಏನೂ ಉಳಿಯುವುದಿಲ್ಲ ಅಥವಾ ಮುದ್ರಿತವಾಗುವುದಿಲ್ಲ.",
  "documents.printError":
    "ಮುದ್ರಣ ಹಾಳೆ ತೆರೆಯಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ. ಟೋಕನ್ ಮತ್ತು ಆರ್ಡರ್ ಬದಲಾಗಿಲ್ಲ.",
  "documents.unknown": "ಲಭ್ಯವಿಲ್ಲ",
  "documents.viewReceipt": "ರಸೀದಿ ನೋಡಿ",
};
