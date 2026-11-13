export const en = {
  "queue.eyebrow": "KNOW BEFORE YOU GO",
  "queue.title": "Queue Tracker",
  "queue.description":
    "Your requests, authoritative queue positions, and the latest available estimates. Time alone never changes a job status.",
  "queue.loading": "Loading the current snapshot…",
  "queue.retry": "Retry",
  "queue.cancel": "Cancel",
  "queue.unavailable": "Unavailable",
  "queue.minutes": "{value} min",
  "queue.stale":
    "Last-known information — the connection or snapshot is stale. Estimates may have changed; refresh before relying on them.",
  "queue.asOf": "As of {time}",
  "queue.source.local":
    "Local Demo — fictional estimates on this browser, not connected to a shop.",
  "queue.source.shared":
    "Shop-supplied snapshot. Prices, order, and estimates are provided by the connected service.",
  "queue.shopProvided": "Shop-provided text (original language):",
  "queue.requests": "Your current requests",
  "queue.privacy":
    "Only requests available to you are shown. Queue positions can include other requests whose details remain private.",
  "queue.loadFailed":
    "The current queue is unavailable. Your last-known requests, if any, have not been replaced with an invented queue.",
  "queue.unknownQueue":
    "Queue order is unavailable. Dependent positions, waits, and ready estimates cannot currently be confirmed.",
  "queue.policy": "Supplied queue policy",
  "queue.empty.title": "No current requests",
  "queue.empty.description":
    "Create a print request, or reopen collected requests from My Jobs.",
  "queue.newPrint": "New Print",
  "queue.fixture": "Fictional guided-demo request",
  "queue.position": "Queue position",
  "queue.jobsAhead": "Jobs ahead",
  "queue.wait": "Estimated wait",
  "queue.duration": "Processing duration",
  "queue.readyAt": "Estimated ready time",
  "queue.cost": "Estimated printing cost",
  "queue.remaining": "Remaining printing work",
  "queue.estimateElapsed":
    "This estimated ready time has elapsed. Awaiting a service update — the job has not automatically become Ready.",
  "queue.readyMessage":
    "Ready for pickup. Check the suggested pickup window; it is not a reservation.",
  "queue.details": "View job details",
  "queue.status.queued": "Queued",
  "queue.status.printing": "Printing",
  "queue.status.ready": "Ready for Pickup",
  "queue.status.collected": "Collected",
  "queue.token.label": "Pickup token",
  "queue.token.help":
    "Enter the complete token from one of your requests. Spaces around the token and letter case are ignored.",
  "queue.token.find": "Find my job",
  "queue.token.notFound":
    "Token not found. Check your pickup token and try again.",
  "queue.printer.title": "Printer availability",
  "queue.printer.operational": "Operational",
  "queue.printer.paused": "Paused",
  "queue.printer.maintenance": "Maintenance",
  "queue.printer.resumed": "Resumed",
  "queue.printer.unknown": "Printer availability unknown",
  "queue.printer.resumeAt":
    "Expected recovery: {time}. This is an estimate, not an automatic restart.",
  "queue.printer.resumeElapsed":
    "The expected recovery time has passed without a Resumed update. Do not assume the printer has restarted.",
  "queue.printer.unknownDowntime":
    "Recovery time is unknown. Dependent wait, ready, and pickup estimates may be unavailable; known costs and processing durations remain useful.",
  "queue.printer.changedAt": "Availability last changed: {time}",
  "queue.printer.noAutomaticProgress":
    "Only an explicit service or labelled fixture update changes printer and job states. There is no timer-based progress.",
  "queue.optimization.title": "Supplied queue-change explanation",
  "queue.optimization.urgent-approved": "An urgent request was approved.",
  "queue.optimization.shorter-jobs-first":
    "The service reports a shorter-jobs-first change.",
  "queue.optimization.other": "The service reports a queue adjustment.",
  "queue.optimization.position": "Position: {previous} → {current}",
  "queue.optimization.pickup": "Ready estimate: {previous} → {current}",
  "queue.pickup.title": "Suggested pickup window",
  "queue.pickup.range": "{start} – {end}",
  "queue.pickup.notReservation":
    "Suggestion only — not a reservation or guaranteed handover time.",
  "queue.pickup.knownHours":
    "Uses supplied dated pickup hours in {timeZone}. These are pickup hours, not a printing schedule.",
  "queue.pickup.noHours":
    "Shop pickup hours are not configured. This suggestion does not confirm that the shop is open.",
  "queue.pickup.eta-unavailable":
    "Pickup window unavailable because a reliable ready estimate is unavailable.",
  "queue.pickup.outside-known-hours":
    "No eligible pickup opening is available in the supplied hours. A future opening is not assumed.",
  "queue.pickup.not-applicable":
    "A pickup window does not apply to a collected request.",
  "queue.pickup.failed":
    "A matching pickup window could not be loaded. Retry to use the current snapshot.",
  "queue.urgent.section": "Urgent request",
  "queue.urgent.request": "Request urgent printing",
  "queue.urgent.title": "Request urgent printing?",
  "queue.urgent.pending":
    "Urgent request pending — queue priority has not changed.",
  "queue.urgent.approved":
    "Urgent request approved by the service or labelled demo fixture.",
  "queue.urgent.rejected":
    "Urgent request rejected. The request did not change queue priority.",
  "queue.urgent.fairness":
    "Urgent printing can delay other requests. Please request it only when necessary. Other students’ identities and documents are not shown.",
  "queue.urgent.noPromise":
    "Sending a request only marks it Pending. Approval is separate, and this preview does not reserve a position or pickup time.",
  "queue.urgent.ineligible":
    "This job is no longer eligible for an urgent request. No new request will be sent.",
  "queue.urgent.connectionRequired":
    "A fresh connected snapshot is required before sending this request.",
  "queue.urgent.loading": "Loading the current urgency impact…",
  "queue.urgent.unavailable":
    "Impact estimates are unavailable. You can still send a request; approval and timing are not guaranteed.",
  "queue.urgent.currentWait": "Current wait",
  "queue.urgent.proposedWait": "Wait if approved now",
  "queue.urgent.timeSaved": "Potential time saved",
  "queue.urgent.affected": "Other requests affected",
  "queue.urgent.currentReady": "Current ready estimate",
  "queue.urgent.proposedReady": "Ready estimate if approved now",
  "queue.urgent.additionalWait": "Additional wait for affected requests",
  "queue.urgent.waitRange": "{min}–{max} min",
  "queue.urgent.submitting": "Sending request…",
  "queue.urgent.confirm": "Confirm request",
  "queue.estimate.link": "Estimate a print",
  "queue.estimate.eyebrow": "PLAN YOUR PRINT",
  "queue.estimate.title": "Print Estimate",
  "queue.estimate.description":
    "Compare validated print preferences using the same service that quotes submitted jobs. Nothing is submitted here.",
  "queue.estimate.preferences": "Print preferences",
  "queue.estimate.pages": "Pages per copy",
  "queue.estimate.pagesHelp":
    "Whole decimal digits only, from 1 to {max}. Check your document’s actual page count.",
  "queue.estimate.copiesHelp": "Whole decimal digits only, from 1 to {max}.",
  "queue.copies": "Copies",
  "queue.mode": "Print mode",
  "queue.mode.bw": "Black & white",
  "queue.mode.colour": "Colour",
  "queue.estimate.paper": "Paper size",
  "queue.estimate.a4": "A4",
  "queue.estimate.duplex": "Double-sided printing (duplex)",
  "queue.estimate.pageNotice":
    "Page count is entered manually. Duplex can reduce sheets, but it does not halve printed sides or price.",
  "queue.estimate.summary": "Service quote",
  "queue.estimate.loading": "Loading a matching quote…",
  "queue.estimate.sides": "Printed sides",
  "queue.estimate.sheets": "Sheets",
  "queue.estimate.rate": "Price per printed side",
  "queue.estimate.total": "Wait + processing",
  "queue.estimate.invalid":
    "Enter valid whole-number pages and copies before requesting a quote or using these preferences.",
  "queue.estimate.noSubmission":
    "Using preferences explicitly opens a new draft. It does not submit a job, attach a file, or overwrite an existing draft.",
  "queue.estimate.creating": "Opening a new draft…",
  "queue.estimate.use": "Use preferences in a new print",
  "queue.simulate.link": "What-If Simulator",
  "queue.simulate.eyebrow": "COMPARE WITHOUT COMMITTING",
  "queue.simulate.title": "What-If Simulator",
  "queue.simulate.description":
    "Compare a queued request or a valid existing draft using a read-only service calculation.",
  "queue.simulate.only": "Simulation Only — No Changes Applied",
  "queue.simulate.approval":
    "Urgency still requires a separate real request and approval. Draft scenarios still require submission. These results reserve nothing.",
  "queue.simulate.baseline": "Current estimate",
  "queue.simulate.hypothetical": "Hypothetical estimate",
  "queue.simulate.deltas": "Estimated changes",
  "queue.simulate.deltaExplanation":
    "Hypothetical minus current estimate. A negative value means a reduction; unknown values remain unavailable.",
  "queue.simulate.costDelta": "Cost change",
  "queue.simulate.waitDelta": "Wait change",
  "queue.simulate.pickupDelta": "Ready-time change",
  "queue.simulate.refreshNeeded":
    "The baseline snapshot changed or could not be matched. Run the simulation again to rebuild it from the current revision.",
  "queue.simulate.loading": "Calculating the read-only scenario…",
  "queue.simulate.unavailable":
    "This service cannot provide this simulation right now. No changes were applied.",
  "queue.simulate.draftLoading":
    "Reading the existing draft, without saving it…",
  "queue.simulate.draftUnavailable":
    "The requested draft is missing, incomplete, or no longer valid in this local dataset.",
  "queue.simulate.empty": "No eligible scenario target",
  "queue.simulate.noDraftCreation":
    "Choose a queued job or prepare a valid draft in New Print. The simulator never creates or saves drafts.",
  "queue.simulate.target": "Scenario target",
  "queue.simulate.choose": "Choose a queued job or existing draft",
  "queue.simulate.currentDraft": "Current saved draft",
  "queue.simulate.targetUnavailable":
    "Select an eligible queued job or valid saved draft. Started and completed jobs cannot be edited speculatively.",
  "queue.simulate.draftReadOnly":
    "This existing draft is read only here. Its fields and selected file will not be changed.",
  "queue.simulate.urgent": "Preview an urgent request",
  "queue.simulate.printer": "Printer scenario",
  "queue.simulate.keepPrinter": "Keep current printer availability",
  "queue.simulate.recovery": "Recovery estimate",
  "queue.simulate.known": "Known remaining downtime",
  "queue.simulate.unknown": "Unknown recovery time",
  "queue.simulate.minutes": "Downtime minutes",
  "queue.simulate.minutesHelp":
    "Enter positive decimal minutes from the snapshot time. This replaces simulated downtime; it is not added twice.",
  "queue.simulate.run": "Run simulation",
  "queue.simulate.controlsChanged":
    "Scenario controls changed. Run the simulation again to compare these preferences.",
} as const;

export const hi: Record<keyof typeof en, string> = {
  "queue.eyebrow": "जाने से पहले जानें",
  "queue.title": "कतार ट्रैकर",
  "queue.description":
    "आपके अनुरोध, सेवा द्वारा दिए गए कतार स्थान और नवीनतम उपलब्ध अनुमान। केवल समय बीतने से काम की स्थिति नहीं बदलती।",
  "queue.loading": "वर्तमान स्थिति लोड हो रही है…",
  "queue.retry": "फिर प्रयास करें",
  "queue.cancel": "रद्द करें",
  "queue.unavailable": "अनुपलब्ध",
  "queue.minutes": "{value} मिनट",
  "queue.stale":
    "यह अंतिम ज्ञात जानकारी है — कनेक्शन या स्थिति पुरानी है। अनुमान बदल सकते हैं; भरोसा करने से पहले ताज़ा करें।",
  "queue.asOf": "{time} की स्थिति",
  "queue.source.local":
    "स्थानीय डेमो — इसी ब्राउज़र पर काल्पनिक अनुमान; किसी दुकान से जुड़ा नहीं है।",
  "queue.source.shared":
    "दुकान द्वारा दी गई स्थिति। कीमत, क्रम और अनुमान जुड़ी हुई सेवा से मिलते हैं।",
  "queue.shopProvided": "दुकान का पाठ (मूल भाषा):",
  "queue.requests": "आपके वर्तमान अनुरोध",
  "queue.privacy":
    "केवल आपको उपलब्ध अनुरोध दिखते हैं। कतार स्थान में अन्य अनुरोध शामिल हो सकते हैं, जिनकी जानकारी निजी रहती है।",
  "queue.loadFailed":
    "वर्तमान कतार उपलब्ध नहीं है। पहले के ज्ञात अनुरोधों को किसी काल्पनिक कतार से नहीं बदला गया है।",
  "queue.unknownQueue":
    "कतार क्रम उपलब्ध नहीं है। उस पर निर्भर स्थान, प्रतीक्षा और तैयार होने के समय की पुष्टि नहीं की जा सकती।",
  "queue.policy": "दी गई कतार नीति",
  "queue.empty.title": "कोई वर्तमान अनुरोध नहीं",
  "queue.empty.description":
    "प्रिंट अनुरोध बनाएँ, या मेरे काम से लिए जा चुके अनुरोध फिर खोलें।",
  "queue.newPrint": "नया प्रिंट",
  "queue.fixture": "निर्देशित डेमो का काल्पनिक अनुरोध",
  "queue.position": "कतार में स्थान",
  "queue.jobsAhead": "आगे के काम",
  "queue.wait": "अनुमानित प्रतीक्षा",
  "queue.duration": "प्रिंट करने की अवधि",
  "queue.readyAt": "तैयार होने का अनुमानित समय",
  "queue.cost": "प्रिंट की अनुमानित कीमत",
  "queue.remaining": "बाकी प्रिंट कार्य",
  "queue.estimateElapsed":
    "तैयार होने का अनुमानित समय बीत चुका है। सेवा के अपडेट की प्रतीक्षा है — काम अपने आप तैयार नहीं हुआ है।",
  "queue.readyMessage":
    "लेने के लिए तैयार है। सुझाई गई लेने की अवधि देखें; यह आरक्षण नहीं है।",
  "queue.details": "काम का विवरण देखें",
  "queue.status.queued": "कतार में",
  "queue.status.printing": "प्रिंट हो रहा है",
  "queue.status.ready": "लेने के लिए तैयार",
  "queue.status.collected": "ले लिया गया",
  "queue.token.label": "लेने का टोकन",
  "queue.token.help":
    "अपने अनुरोध का पूरा टोकन दर्ज करें। शुरुआत और अंत के खाली स्थान तथा बड़े-छोटे अक्षरों का अंतर नहीं गिना जाता।",
  "queue.token.find": "मेरा काम खोजें",
  "queue.token.notFound": "टोकन नहीं मिला। अपना लेने का टोकन जाँचकर फिर प्रयास करें।",
  "queue.printer.title": "प्रिंटर की उपलब्धता",
  "queue.printer.operational": "काम कर रहा है",
  "queue.printer.paused": "रुका हुआ",
  "queue.printer.maintenance": "रखरखाव में",
  "queue.printer.resumed": "फिर चालू हुआ",
  "queue.printer.unknown": "प्रिंटर की उपलब्धता अज्ञात है",
  "queue.printer.resumeAt":
    "फिर चालू होने का अनुमान: {time}। यह अनुमान है, अपने आप चालू होने की घोषणा नहीं।",
  "queue.printer.resumeElapsed":
    "अनुमानित समय बीत गया, लेकिन फिर चालू होने का अपडेट नहीं मिला। प्रिंटर चालू मानकर न चलें।",
  "queue.printer.unknownDowntime":
    "फिर चालू होने का समय अज्ञात है। प्रतीक्षा, तैयारी और लेने के अनुमान उपलब्ध न हों; ज्ञात कीमत और प्रिंट अवधि फिर भी उपयोगी हैं।",
  "queue.printer.changedAt": "उपलब्धता में अंतिम बदलाव: {time}",
  "queue.printer.noAutomaticProgress":
    "केवल सेवा या स्पष्ट रूप से चिह्नित डेमो अपडेट ही प्रिंटर और काम की स्थिति बदलता है। घड़ी से प्रगति नहीं होती।",
  "queue.optimization.title": "सेवा द्वारा दिया गया कतार बदलाव का कारण",
  "queue.optimization.urgent-approved": "एक तत्काल अनुरोध मंज़ूर हुआ।",
  "queue.optimization.shorter-jobs-first":
    "सेवा ने छोटे काम पहले करने का बदलाव बताया है।",
  "queue.optimization.other": "सेवा ने कतार में समायोजन बताया है।",
  "queue.optimization.position": "स्थान: {previous} → {current}",
  "queue.optimization.pickup": "तैयार होने का अनुमान: {previous} → {current}",
  "queue.pickup.title": "लेने की सुझाई गई अवधि",
  "queue.pickup.range": "{start} – {end}",
  "queue.pickup.notReservation": "केवल सुझाव — न आरक्षण, न सौंपने के समय की गारंटी।",
  "queue.pickup.knownHours":
    "{timeZone} में दी गई तारीखों के लेने के समय इस्तेमाल होते हैं। ये लेने के घंटे हैं, प्रिंट करने की समय-सारणी नहीं।",
  "queue.pickup.noHours":
    "दुकान के लेने के घंटे तय नहीं हैं। यह सुझाव दुकान खुली होने की पुष्टि नहीं करता।",
  "queue.pickup.eta-unavailable":
    "विश्वसनीय तैयारी अनुमान न होने से लेने की अवधि उपलब्ध नहीं है।",
  "queue.pickup.outside-known-hours":
    "दिए गए घंटों में लेने का उपयुक्त खुलने का समय नहीं है। भविष्य का खुलने का समय मान नहीं लिया जाता।",
  "queue.pickup.not-applicable": "ले लिए गए अनुरोध पर लेने की अवधि लागू नहीं होती।",
  "queue.pickup.failed":
    "वर्तमान स्थिति से मेल खाती लेने की अवधि लोड नहीं हुई। फिर प्रयास करें।",
  "queue.urgent.section": "तत्काल अनुरोध",
  "queue.urgent.request": "तत्काल प्रिंट का अनुरोध करें",
  "queue.urgent.title": "तत्काल प्रिंट का अनुरोध करें?",
  "queue.urgent.pending": "तत्काल अनुरोध लंबित है — कतार की प्राथमिकता नहीं बदली है।",
  "queue.urgent.approved": "सेवा या चिह्नित डेमो ने तत्काल अनुरोध मंज़ूर किया है।",
  "queue.urgent.rejected":
    "तत्काल अनुरोध अस्वीकार हुआ। अनुरोध ने कतार की प्राथमिकता नहीं बदली।",
  "queue.urgent.fairness":
    "तत्काल प्रिंट से दूसरे अनुरोध देर से पूरे हो सकते हैं। ज़रूरत होने पर ही माँगें। दूसरे विद्यार्थियों की पहचान और दस्तावेज़ नहीं दिखते।",
  "queue.urgent.noPromise":
    "भेजने पर अनुरोध केवल लंबित होता है। मंज़ूरी अलग है और यह पूर्वावलोकन स्थान या लेने का समय सुरक्षित नहीं करता।",
  "queue.urgent.ineligible":
    "यह काम अब तत्काल अनुरोध के योग्य नहीं है। नया अनुरोध नहीं भेजा जाएगा।",
  "queue.urgent.connectionRequired":
    "यह अनुरोध भेजने के लिए ताज़ा, जुड़ी हुई सेवा की स्थिति ज़रूरी है।",
  "queue.urgent.loading": "तत्काल अनुरोध का वर्तमान प्रभाव लोड हो रहा है…",
  "queue.urgent.unavailable":
    "प्रभाव के अनुमान उपलब्ध नहीं हैं। फिर भी अनुरोध भेज सकते हैं; मंज़ूरी और समय की गारंटी नहीं है।",
  "queue.urgent.currentWait": "वर्तमान प्रतीक्षा",
  "queue.urgent.proposedWait": "अभी मंज़ूरी मिले तो प्रतीक्षा",
  "queue.urgent.timeSaved": "संभावित बचा समय",
  "queue.urgent.affected": "प्रभावित अन्य अनुरोध",
  "queue.urgent.currentReady": "वर्तमान तैयारी अनुमान",
  "queue.urgent.proposedReady": "अभी मंज़ूरी मिले तो तैयारी अनुमान",
  "queue.urgent.additionalWait": "प्रभावित अनुरोधों की अतिरिक्त प्रतीक्षा",
  "queue.urgent.waitRange": "{min}–{max} मिनट",
  "queue.urgent.submitting": "अनुरोध भेजा जा रहा है…",
  "queue.urgent.confirm": "अनुरोध की पुष्टि करें",
  "queue.estimate.link": "प्रिंट का अनुमान लगाएँ",
  "queue.estimate.eyebrow": "अपने प्रिंट की योजना बनाएँ",
  "queue.estimate.title": "प्रिंट अनुमान",
  "queue.estimate.description":
    "जमा किए गए काम को कीमत देने वाली उसी सेवा से मान्य प्रिंट विकल्पों की तुलना करें। यहाँ कुछ जमा नहीं होता।",
  "queue.estimate.preferences": "प्रिंट विकल्प",
  "queue.estimate.pages": "हर प्रति में पृष्ठ",
  "queue.estimate.pagesHelp":
    "केवल पूर्ण दशमलव अंक, 1 से {max} तक। दस्तावेज़ के वास्तविक पृष्ठ जाँचें।",
  "queue.estimate.copiesHelp": "केवल पूर्ण दशमलव अंक, 1 से {max} तक।",
  "queue.copies": "प्रतियाँ",
  "queue.mode": "प्रिंट प्रकार",
  "queue.mode.bw": "श्वेत-श्याम",
  "queue.mode.colour": "रंगीन",
  "queue.estimate.paper": "कागज़ का आकार",
  "queue.estimate.a4": "ए4",
  "queue.estimate.duplex": "दोनों ओर प्रिंट (डुप्लेक्स)",
  "queue.estimate.pageNotice":
    "पृष्ठ संख्या हाथ से दर्ज है। दोनों ओर प्रिंट से कागज़ घट सकता है, लेकिन छपी सतहें या कीमत आधी नहीं होतीं।",
  "queue.estimate.summary": "सेवा का मूल्य अनुमान",
  "queue.estimate.loading": "मेल खाता मूल्य अनुमान लोड हो रहा है…",
  "queue.estimate.sides": "छपी सतहें",
  "queue.estimate.sheets": "कागज़ की चादरें",
  "queue.estimate.rate": "हर छपी सतह की कीमत",
  "queue.estimate.total": "प्रतीक्षा + प्रिंट अवधि",
  "queue.estimate.invalid":
    "अनुमान लेने या विकल्प इस्तेमाल करने से पहले पृष्ठ और प्रतियाँ मान्य पूर्ण अंकों में दर्ज करें।",
  "queue.estimate.noSubmission":
    "विकल्प इस्तेमाल करने पर स्पष्ट कार्रवाई से नया मसौदा खुलेगा। काम जमा नहीं होगा, फ़ाइल नहीं जुड़ेगी और पुराना मसौदा नहीं बदलेगा।",
  "queue.estimate.creating": "नया मसौदा खुल रहा है…",
  "queue.estimate.use": "नए प्रिंट में ये विकल्प इस्तेमाल करें",
  "queue.simulate.link": "क्या हो अगर सिमुलेटर",
  "queue.simulate.eyebrow": "बिना बदलाव किए तुलना करें",
  "queue.simulate.title": "क्या हो अगर सिमुलेटर",
  "queue.simulate.description":
    "केवल पढ़ने वाली सेवा गणना से कतार के अनुरोध या पहले से मान्य मसौदे की तुलना करें।",
  "queue.simulate.only": "केवल सिमुलेशन — कोई बदलाव लागू नहीं हुआ",
  "queue.simulate.approval":
    "तत्काल सेवा के लिए अलग वास्तविक अनुरोध और मंज़ूरी चाहिए। मसौदे को अभी भी जमा करना होगा। इन परिणामों से कुछ आरक्षित नहीं होता।",
  "queue.simulate.baseline": "वर्तमान अनुमान",
  "queue.simulate.hypothetical": "काल्पनिक अनुमान",
  "queue.simulate.deltas": "अनुमानित बदलाव",
  "queue.simulate.deltaExplanation":
    "काल्पनिक अनुमान में से वर्तमान अनुमान घटाया गया है। ऋणात्मक मान कमी दिखाता है; अज्ञात मान अनुपलब्ध रहते हैं।",
  "queue.simulate.costDelta": "कीमत में बदलाव",
  "queue.simulate.waitDelta": "प्रतीक्षा में बदलाव",
  "queue.simulate.pickupDelta": "तैयारी समय में बदलाव",
  "queue.simulate.refreshNeeded":
    "मूल स्थिति बदली है या मेल नहीं खाती। वर्तमान संस्करण से फिर तुलना करने के लिए सिमुलेशन दोबारा चलाएँ।",
  "queue.simulate.loading": "केवल पढ़ने वाला परिदृश्य गणना में है…",
  "queue.simulate.unavailable":
    "यह सेवा अभी यह सिमुलेशन नहीं दे सकती। कोई बदलाव लागू नहीं हुआ।",
  "queue.simulate.draftLoading": "बिना सहेजे मौजूदा मसौदा पढ़ा जा रहा है…",
  "queue.simulate.draftUnavailable":
    "माँगा गया मसौदा गायब, अधूरा या इस स्थानीय डेटा में अब मान्य नहीं है।",
  "queue.simulate.empty": "कोई योग्य परिदृश्य लक्ष्य नहीं",
  "queue.simulate.noDraftCreation":
    "कतार का काम चुनें या नए प्रिंट में मान्य मसौदा तैयार करें। सिमुलेटर मसौदा न बनाता है, न सहेजता है।",
  "queue.simulate.target": "परिदृश्य लक्ष्य",
  "queue.simulate.choose": "कतार का काम या मौजूदा मसौदा चुनें",
  "queue.simulate.currentDraft": "वर्तमान सहेजा मसौदा",
  "queue.simulate.targetUnavailable":
    "योग्य कतार काम या मान्य मसौदा चुनें। शुरू या पूरे हो चुके काम में काल्पनिक संपादन नहीं होता।",
  "queue.simulate.draftReadOnly":
    "यह मौजूदा मसौदा यहाँ केवल पढ़ने के लिए है। उसके फ़ील्ड और चुनी फ़ाइल नहीं बदलेंगे।",
  "queue.simulate.urgent": "तत्काल अनुरोध का पूर्वावलोकन",
  "queue.simulate.printer": "प्रिंटर परिदृश्य",
  "queue.simulate.keepPrinter": "वर्तमान प्रिंटर उपलब्धता रखें",
  "queue.simulate.recovery": "फिर चालू होने का अनुमान",
  "queue.simulate.known": "ज्ञात बाकी रुकावट",
  "queue.simulate.unknown": "फिर चालू होने का समय अज्ञात",
  "queue.simulate.minutes": "रुकावट के मिनट",
  "queue.simulate.minutesHelp":
    "स्थिति के समय से धनात्मक दशमलव मिनट दर्ज करें। यह काल्पनिक रुकावट को बदलता है; दो बार नहीं जोड़ता।",
  "queue.simulate.run": "सिमुलेशन चलाएँ",
  "queue.simulate.controlsChanged":
    "परिदृश्य विकल्प बदले हैं। इन विकल्पों की तुलना के लिए सिमुलेशन फिर चलाएँ।",
};

export const kn: Record<keyof typeof en, string> = {
  "queue.eyebrow": "ಹೋಗುವ ಮೊದಲು ತಿಳಿಯಿರಿ",
  "queue.title": "ಸರದಿ ಟ್ರ್ಯಾಕರ್",
  "queue.description":
    "ನಿಮ್ಮ ವಿನಂತಿಗಳು, ಸೇವೆಯ ಅಧಿಕೃತ ಸರದಿ ಸ್ಥಾನಗಳು ಮತ್ತು ಇತ್ತೀಚಿನ ಲಭ್ಯ ಅಂದಾಜುಗಳು. ಸಮಯ ಕಳೆದ ಮಾತ್ರಕ್ಕೆ ಕೆಲಸದ ಸ್ಥಿತಿ ಬದಲಾಗುವುದಿಲ್ಲ.",
  "queue.loading": "ಪ್ರಸ್ತುತ ಸ್ಥಿತಿಯನ್ನು ಲೋಡ್ ಮಾಡಲಾಗುತ್ತಿದೆ…",
  "queue.retry": "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ",
  "queue.cancel": "ರದ್ದುಮಾಡಿ",
  "queue.unavailable": "ಲಭ್ಯವಿಲ್ಲ",
  "queue.minutes": "{value} ನಿಮಿಷ",
  "queue.stale":
    "ಕೊನೆಯದಾಗಿ ತಿಳಿದ ಮಾಹಿತಿ — ಸಂಪರ್ಕ ಅಥವಾ ಸ್ಥಿತಿ ಹಳೆಯದಾಗಿದೆ. ಅಂದಾಜುಗಳು ಬದಲಾಗಿರಬಹುದು; ಅವಲಂಬಿಸುವ ಮೊದಲು ನವೀಕರಿಸಿ.",
  "queue.asOf": "{time} ರ ಸ್ಥಿತಿ",
  "queue.source.local":
    "ಸ್ಥಳೀಯ ಡೆಮೊ — ಈ ಬ್ರೌಸರ್‌ನಲ್ಲಿನ ಕಾಲ್ಪನಿಕ ಅಂದಾಜುಗಳು; ಅಂಗಡಿಗೆ ಸಂಪರ್ಕವಿಲ್ಲ.",
  "queue.source.shared":
    "ಅಂಗಡಿ ಒದಗಿಸಿದ ಸ್ಥಿತಿ. ದರ, ಕ್ರಮ ಮತ್ತು ಅಂದಾಜುಗಳನ್ನು ಸಂಪರ್ಕಿತ ಸೇವೆ ಒದಗಿಸುತ್ತದೆ.",
  "queue.shopProvided": "ಅಂಗಡಿ ಒದಗಿಸಿದ ಪಠ್ಯ (ಮೂಲ ಭಾಷೆ):",
  "queue.requests": "ನಿಮ್ಮ ಪ್ರಸ್ತುತ ವಿನಂತಿಗಳು",
  "queue.privacy":
    "ನಿಮಗೆ ಲಭ್ಯವಾದ ವಿನಂತಿಗಳನ್ನು ಮಾತ್ರ ತೋರಿಸಲಾಗುತ್ತದೆ. ಸರದಿ ಸ್ಥಾನಗಳಲ್ಲಿ ವಿವರಗಳನ್ನು ಖಾಸಗಿಯಾಗಿ ಇಡಲಾದ ಇತರ ವಿನಂತಿಗಳೂ ಇರಬಹುದು.",
  "queue.loadFailed":
    "ಪ್ರಸ್ತುತ ಸರದಿ ಲಭ್ಯವಿಲ್ಲ. ಹಿಂದೆ ತಿಳಿದ ವಿನಂತಿಗಳಿದ್ದರೆ ಅವುಗಳನ್ನು ಕಾಲ್ಪನಿಕ ಸರದಿಯಿಂದ ಬದಲಿಸಿಲ್ಲ.",
  "queue.unknownQueue":
    "ಸರದಿ ಕ್ರಮ ಲಭ್ಯವಿಲ್ಲ. ಅದನ್ನು ಅವಲಂಬಿಸಿದ ಸ್ಥಾನ, ಕಾಯುವಿಕೆ ಮತ್ತು ಸಿದ್ಧವಾಗುವ ಅಂದಾಜುಗಳನ್ನು ದೃಢಪಡಿಸಲಾಗುವುದಿಲ್ಲ.",
  "queue.policy": "ಒದಗಿಸಿದ ಸರದಿ ನೀತಿ",
  "queue.empty.title": "ಪ್ರಸ್ತುತ ವಿನಂತಿಗಳಿಲ್ಲ",
  "queue.empty.description":
    "ಮುದ್ರಣ ವಿನಂತಿ ರಚಿಸಿ ಅಥವಾ ನನ್ನ ಕೆಲಸಗಳಿಂದ ಪಡೆದ ವಿನಂತಿಗಳನ್ನು ಮತ್ತೆ ತೆರೆಯಿರಿ.",
  "queue.newPrint": "ಹೊಸ ಮುದ್ರಣ",
  "queue.fixture": "ಮಾರ್ಗದರ್ಶಿತ ಡೆಮೊದ ಕಾಲ್ಪನಿಕ ವಿನಂತಿ",
  "queue.position": "ಸರದಿಯಲ್ಲಿನ ಸ್ಥಾನ",
  "queue.jobsAhead": "ಮುಂದಿರುವ ಕೆಲಸಗಳು",
  "queue.wait": "ಅಂದಾಜು ಕಾಯುವಿಕೆ",
  "queue.duration": "ಮುದ್ರಣ ಅವಧಿ",
  "queue.readyAt": "ಅಂದಾಜು ಸಿದ್ಧ ಸಮಯ",
  "queue.cost": "ಅಂದಾಜು ಮುದ್ರಣ ವೆಚ್ಚ",
  "queue.remaining": "ಉಳಿದ ಮುದ್ರಣ ಕೆಲಸ",
  "queue.estimateElapsed":
    "ಅಂದಾಜು ಸಿದ್ಧ ಸಮಯ ಕಳೆದಿದೆ. ಸೇವೆಯ ನವೀಕರಣಕ್ಕಾಗಿ ಕಾಯಲಾಗುತ್ತಿದೆ — ಕೆಲಸ ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಸಿದ್ಧವಾಗಿಲ್ಲ.",
  "queue.readyMessage":
    "ಪಡೆಯಲು ಸಿದ್ಧವಾಗಿದೆ. ಸೂಚಿಸಿದ ಪಡೆಯುವ ಸಮಯ ನೋಡಿ; ಅದು ಕಾಯ್ದಿರಿಸುವಿಕೆ ಅಲ್ಲ.",
  "queue.details": "ಕೆಲಸದ ವಿವರ ನೋಡಿ",
  "queue.status.queued": "ಸರದಿಯಲ್ಲಿದೆ",
  "queue.status.printing": "ಮುದ್ರಿಸಲಾಗುತ್ತಿದೆ",
  "queue.status.ready": "ಪಡೆಯಲು ಸಿದ್ಧ",
  "queue.status.collected": "ಪಡೆಯಲಾಗಿದೆ",
  "queue.token.label": "ಪಡೆಯುವ ಟೋಕನ್",
  "queue.token.help":
    "ನಿಮ್ಮ ವಿನಂತಿಯ ಸಂಪೂರ್ಣ ಟೋಕನ್ ನಮೂದಿಸಿ. ಆರಂಭ ಮತ್ತು ಕೊನೆಯ ಖಾಲಿ ಜಾಗಗಳು ಹಾಗೂ ದೊಡ್ಡ-ಸಣ್ಣ ಅಕ್ಷರಗಳ ವ್ಯತ್ಯಾಸವನ್ನು ಕಡೆಗಣಿಸಲಾಗುತ್ತದೆ.",
  "queue.token.find": "ನನ್ನ ಕೆಲಸ ಹುಡುಕಿ",
  "queue.token.notFound": "ಟೋಕನ್ ಸಿಗಲಿಲ್ಲ. ನಿಮ್ಮ ಪಡೆಯುವ ಟೋಕನ್ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
  "queue.printer.title": "ಪ್ರಿಂಟರ್ ಲಭ್ಯತೆ",
  "queue.printer.operational": "ಕಾರ್ಯನಿರ್ವಹಿಸುತ್ತಿದೆ",
  "queue.printer.paused": "ವಿರಾಮದಲ್ಲಿದೆ",
  "queue.printer.maintenance": "ನಿರ್ವಹಣೆಯಲ್ಲಿದೆ",
  "queue.printer.resumed": "ಮತ್ತೆ ಆರಂಭವಾಗಿದೆ",
  "queue.printer.unknown": "ಪ್ರಿಂಟರ್ ಲಭ್ಯತೆ ತಿಳಿದಿಲ್ಲ",
  "queue.printer.resumeAt":
    "ಚೇತರಿಕೆಯ ಅಂದಾಜು: {time}. ಇದು ಅಂದಾಜು ಮಾತ್ರ, ಸ್ವಯಂಚಾಲಿತ ಮರುಪ್ರಾರಂಭವಲ್ಲ.",
  "queue.printer.resumeElapsed":
    "ಅಂದಾಜು ಸಮಯ ಕಳೆದರೂ ಮರುಪ್ರಾರಂಭದ ನವೀಕರಣ ಬಂದಿಲ್ಲ. ಪ್ರಿಂಟರ್ ಆರಂಭವಾಗಿದೆ ಎಂದು ಊಹಿಸಬೇಡಿ.",
  "queue.printer.unknownDowntime":
    "ಚೇತರಿಕೆ ಸಮಯ ತಿಳಿದಿಲ್ಲ. ಕಾಯುವಿಕೆ, ಸಿದ್ಧತೆ ಮತ್ತು ಪಡೆಯುವ ಅಂದಾಜುಗಳು ಲಭ್ಯವಿರದಿರಬಹುದು; ತಿಳಿದ ವೆಚ್ಚ ಮತ್ತು ಮುದ್ರಣ ಅವಧಿ ಉಪಯುಕ್ತವಾಗಿವೆ.",
  "queue.printer.changedAt": "ಲಭ್ಯತೆಯ ಕೊನೆಯ ಬದಲಾವಣೆ: {time}",
  "queue.printer.noAutomaticProgress":
    "ಸೇವೆ ಅಥವಾ ಸ್ಪಷ್ಟವಾಗಿ ಗುರುತಿಸಿದ ಡೆಮೊ ನವೀಕರಣ ಮಾತ್ರ ಪ್ರಿಂಟರ್ ಮತ್ತು ಕೆಲಸದ ಸ್ಥಿತಿಯನ್ನು ಬದಲಿಸುತ್ತದೆ. ಸಮಯಾಧಾರಿತ ಪ್ರಗತಿ ಇಲ್ಲ.",
  "queue.optimization.title": "ಸೇವೆ ಒದಗಿಸಿದ ಸರದಿ ಬದಲಾವಣೆಯ ವಿವರಣೆ",
  "queue.optimization.urgent-approved": "ತುರ್ತು ವಿನಂತಿ ಅನುಮೋದಿಸಲಾಗಿದೆ.",
  "queue.optimization.shorter-jobs-first":
    "ಚಿಕ್ಕ ಕೆಲಸಗಳನ್ನು ಮೊದಲು ಮಾಡುವ ಬದಲಾವಣೆಯನ್ನು ಸೇವೆ ತಿಳಿಸಿದೆ.",
  "queue.optimization.other": "ಸರದಿ ಹೊಂದಾಣಿಕೆಯನ್ನು ಸೇವೆ ತಿಳಿಸಿದೆ.",
  "queue.optimization.position": "ಸ್ಥಾನ: {previous} → {current}",
  "queue.optimization.pickup": "ಸಿದ್ಧತಾ ಅಂದಾಜು: {previous} → {current}",
  "queue.pickup.title": "ಪಡೆಯಲು ಸೂಚಿಸಿದ ಸಮಯ",
  "queue.pickup.range": "{start} – {end}",
  "queue.pickup.notReservation":
    "ಸಲಹೆ ಮಾತ್ರ — ಕಾಯ್ದಿರಿಸುವಿಕೆ ಅಥವಾ ಹಸ್ತಾಂತರ ಸಮಯದ ಖಾತರಿ ಅಲ್ಲ.",
  "queue.pickup.knownHours":
    "{timeZone} ನಲ್ಲಿ ಒದಗಿಸಿದ ದಿನಾಂಕಿತ ಪಡೆಯುವ ಸಮಯಗಳನ್ನು ಬಳಸುತ್ತದೆ. ಇವು ಪಡೆಯುವ ಸಮಯಗಳು, ಮುದ್ರಣ ವೇಳಾಪಟ್ಟಿ ಅಲ್ಲ.",
  "queue.pickup.noHours":
    "ಅಂಗಡಿಯ ಪಡೆಯುವ ಸಮಯಗಳನ್ನು ಹೊಂದಿಸಿಲ್ಲ. ಈ ಸಲಹೆ ಅಂಗಡಿ ತೆರೆದಿದೆ ಎಂದು ದೃಢಪಡಿಸುವುದಿಲ್ಲ.",
  "queue.pickup.eta-unavailable":
    "ವಿಶ್ವಾಸಾರ್ಹ ಸಿದ್ಧತಾ ಅಂದಾಜು ಲಭ್ಯವಿಲ್ಲದ ಕಾರಣ ಪಡೆಯುವ ಸಮಯ ಲಭ್ಯವಿಲ್ಲ.",
  "queue.pickup.outside-known-hours":
    "ಒದಗಿಸಿದ ಸಮಯಗಳಲ್ಲಿ ಸೂಕ್ತ ಪಡೆಯುವ ಸಮಯವಿಲ್ಲ. ಮುಂದಿನ ತೆರೆಯುವ ಸಮಯವನ್ನು ಊಹಿಸುವುದಿಲ್ಲ.",
  "queue.pickup.not-applicable": "ಪಡೆದ ವಿನಂತಿಗೆ ಪಡೆಯುವ ಸಮಯ ಅನ್ವಯಿಸುವುದಿಲ್ಲ.",
  "queue.pickup.failed": "ಪ್ರಸ್ತುತ ಸ್ಥಿತಿಗೆ ಹೊಂದುವ ಪಡೆಯುವ ಸಮಯ ಲೋಡ್ ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
  "queue.urgent.section": "ತುರ್ತು ವಿನಂತಿ",
  "queue.urgent.request": "ತುರ್ತು ಮುದ್ರಣ ವಿನಂತಿಸಿ",
  "queue.urgent.title": "ತುರ್ತು ಮುದ್ರಣ ವಿನಂತಿಸಬೇಕೇ?",
  "queue.urgent.pending": "ತುರ್ತು ವಿನಂತಿ ಬಾಕಿಯಿದೆ — ಸರದಿ ಆದ್ಯತೆ ಬದಲಾಗಿಲ್ಲ.",
  "queue.urgent.approved": "ಸೇವೆ ಅಥವಾ ಗುರುತಿಸಿದ ಡೆಮೊ ತುರ್ತು ವಿನಂತಿಯನ್ನು ಅನುಮೋದಿಸಿದೆ.",
  "queue.urgent.rejected": "ತುರ್ತು ವಿನಂತಿ ತಿರಸ್ಕೃತವಾಗಿದೆ. ವಿನಂತಿಯಿಂದ ಸರದಿ ಆದ್ಯತೆ ಬದಲಾಗಿಲ್ಲ.",
  "queue.urgent.fairness":
    "ತುರ್ತು ಮುದ್ರಣವು ಇತರ ವಿನಂತಿಗಳನ್ನು ವಿಳಂಬಗೊಳಿಸಬಹುದು. ಅಗತ್ಯವಿದ್ದಾಗ ಮಾತ್ರ ವಿನಂತಿಸಿ. ಇತರ ವಿದ್ಯಾರ್ಥಿಗಳ ಗುರುತು ಮತ್ತು ದಾಖಲೆಗಳನ್ನು ತೋರಿಸುವುದಿಲ್ಲ.",
  "queue.urgent.noPromise":
    "ಕಳುಹಿಸಿದಾಗ ವಿನಂತಿ ಬಾಕಿ ಎಂದು ಮಾತ್ರ ಗುರುತಿಸಲಾಗುತ್ತದೆ. ಅನುಮೋದನೆ ಪ್ರತ್ಯೇಕ; ಈ ಮುನ್ನೋಟ ಸ್ಥಾನ ಅಥವಾ ಪಡೆಯುವ ಸಮಯವನ್ನು ಕಾಯ್ದಿರಿಸುವುದಿಲ್ಲ.",
  "queue.urgent.ineligible":
    "ಈ ಕೆಲಸಕ್ಕೆ ಈಗ ತುರ್ತು ವಿನಂತಿ ಸಲ್ಲಿಸಲು ಅರ್ಹತೆ ಇಲ್ಲ. ಹೊಸ ವಿನಂತಿ ಕಳುಹಿಸುವುದಿಲ್ಲ.",
  "queue.urgent.connectionRequired": "ಈ ವಿನಂತಿ ಕಳುಹಿಸಲು ಹೊಸದಾದ ಸಂಪರ್ಕಿತ ಸ್ಥಿತಿ ಅಗತ್ಯ.",
  "queue.urgent.loading": "ತುರ್ತು ವಿನಂತಿಯ ಪ್ರಸ್ತುತ ಪರಿಣಾಮ ಲೋಡ್ ಆಗುತ್ತಿದೆ…",
  "queue.urgent.unavailable":
    "ಪರಿಣಾಮದ ಅಂದಾಜುಗಳು ಲಭ್ಯವಿಲ್ಲ. ಆದರೂ ವಿನಂತಿಸಬಹುದು; ಅನುಮೋದನೆ ಮತ್ತು ಸಮಯಕ್ಕೆ ಖಾತರಿ ಇಲ್ಲ.",
  "queue.urgent.currentWait": "ಪ್ರಸ್ತುತ ಕಾಯುವಿಕೆ",
  "queue.urgent.proposedWait": "ಈಗ ಅನುಮೋದಿಸಿದರೆ ಕಾಯುವಿಕೆ",
  "queue.urgent.timeSaved": "ಉಳಿಯಬಹುದಾದ ಸಮಯ",
  "queue.urgent.affected": "ಪರಿಣಾಮ ಬೀರುವ ಇತರ ವಿನಂತಿಗಳು",
  "queue.urgent.currentReady": "ಪ್ರಸ್ತುತ ಸಿದ್ಧತಾ ಅಂದಾಜು",
  "queue.urgent.proposedReady": "ಈಗ ಅನುಮೋದಿಸಿದರೆ ಸಿದ್ಧತಾ ಅಂದಾಜು",
  "queue.urgent.additionalWait": "ಪರಿಣಾಮಿತ ವಿನಂತಿಗಳಿಗೆ ಹೆಚ್ಚುವರಿ ಕಾಯುವಿಕೆ",
  "queue.urgent.waitRange": "{min}–{max} ನಿಮಿಷ",
  "queue.urgent.submitting": "ವಿನಂತಿ ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…",
  "queue.urgent.confirm": "ವಿನಂತಿ ದೃಢಪಡಿಸಿ",
  "queue.estimate.link": "ಮುದ್ರಣದ ಅಂದಾಜು ಪಡೆಯಿರಿ",
  "queue.estimate.eyebrow": "ನಿಮ್ಮ ಮುದ್ರಣವನ್ನು ಯೋಜಿಸಿ",
  "queue.estimate.title": "ಮುದ್ರಣ ಅಂದಾಜು",
  "queue.estimate.description":
    "ಸಲ್ಲಿಸಿದ ಕೆಲಸಗಳಿಗೆ ದರ ನೀಡುವ ಅದೇ ಸೇವೆಯಿಂದ ಮಾನ್ಯ ಮುದ್ರಣ ಆಯ್ಕೆಗಳನ್ನು ಹೋಲಿಸಿ. ಇಲ್ಲಿ ಏನನ್ನೂ ಸಲ್ಲಿಸುವುದಿಲ್ಲ.",
  "queue.estimate.preferences": "ಮುದ್ರಣ ಆಯ್ಕೆಗಳು",
  "queue.estimate.pages": "ಪ್ರತಿ ಪ್ರತಿಯ ಪುಟಗಳು",
  "queue.estimate.pagesHelp":
    "1 ರಿಂದ {max} ವರೆಗಿನ ಪೂರ್ಣ ದಶಮಾಂಶ ಅಂಕಿಗಳು ಮಾತ್ರ. ದಾಖಲೆಯ ನಿಜವಾದ ಪುಟ ಸಂಖ್ಯೆ ಪರಿಶೀಲಿಸಿ.",
  "queue.estimate.copiesHelp": "1 ರಿಂದ {max} ವರೆಗಿನ ಪೂರ್ಣ ದಶಮಾಂಶ ಅಂಕಿಗಳು ಮಾತ್ರ.",
  "queue.copies": "ಪ್ರತಿಗಳು",
  "queue.mode": "ಮುದ್ರಣ ವಿಧಾನ",
  "queue.mode.bw": "ಕಪ್ಪು-ಬಿಳುಪು",
  "queue.mode.colour": "ಬಣ್ಣ",
  "queue.estimate.paper": "ಕಾಗದದ ಗಾತ್ರ",
  "queue.estimate.a4": "ಎ4",
  "queue.estimate.duplex": "ಎರಡೂ ಬದಿಯ ಮುದ್ರಣ (ಡ್ಯೂಪ್ಲೆಕ್ಸ್)",
  "queue.estimate.pageNotice":
    "ಪುಟ ಸಂಖ್ಯೆಯನ್ನು ಕೈಯಾರೆ ನೀಡಲಾಗಿದೆ. ಎರಡೂ ಬದಿಯ ಮುದ್ರಣ ಕಾಗದ ಉಳಿಸಬಹುದು, ಆದರೆ ಮುದ್ರಿತ ಬದಿಗಳು ಅಥವಾ ದರವನ್ನು ಅರ್ಧಗೊಳಿಸುವುದಿಲ್ಲ.",
  "queue.estimate.summary": "ಸೇವೆಯ ದರ ಅಂದಾಜು",
  "queue.estimate.loading": "ಹೊಂದುವ ದರ ಅಂದಾಜು ಲೋಡ್ ಆಗುತ್ತಿದೆ…",
  "queue.estimate.sides": "ಮುದ್ರಿತ ಬದಿಗಳು",
  "queue.estimate.sheets": "ಕಾಗದದ ಹಾಳೆಗಳು",
  "queue.estimate.rate": "ಪ್ರತಿ ಮುದ್ರಿತ ಬದಿಯ ದರ",
  "queue.estimate.total": "ಕಾಯುವಿಕೆ + ಮುದ್ರಣ",
  "queue.estimate.invalid":
    "ಅಂದಾಜು ಪಡೆಯುವ ಅಥವಾ ಆಯ್ಕೆಗಳನ್ನು ಬಳಸುವ ಮೊದಲು ಮಾನ್ಯ ಪೂರ್ಣಾಂಕ ಪುಟಗಳು ಮತ್ತು ಪ್ರತಿಗಳನ್ನು ನಮೂದಿಸಿ.",
  "queue.estimate.noSubmission":
    "ಆಯ್ಕೆಗಳನ್ನು ಬಳಸುವ ಸ್ಪಷ್ಟ ಕ್ರಿಯೆಯಿಂದ ಹೊಸ ಕರಡು ತೆರೆಯುತ್ತದೆ. ಕೆಲಸ ಸಲ್ಲಿಸುವುದಿಲ್ಲ, ಕಡತ ಜೋಡಿಸುವುದಿಲ್ಲ ಅಥವಾ ಹಳೆಯ ಕರಡನ್ನು ಬದಲಿಸುವುದಿಲ್ಲ.",
  "queue.estimate.creating": "ಹೊಸ ಕರಡು ತೆರೆಯಲಾಗುತ್ತಿದೆ…",
  "queue.estimate.use": "ಹೊಸ ಮುದ್ರಣದಲ್ಲಿ ಆಯ್ಕೆಗಳನ್ನು ಬಳಸಿ",
  "queue.simulate.link": "ಏನಾದರೆ ಸಿಮ್ಯುಲೇಟರ್",
  "queue.simulate.eyebrow": "ಬದಲಾವಣೆ ಮಾಡದೆ ಹೋಲಿಸಿ",
  "queue.simulate.title": "ಏನಾದರೆ ಸಿಮ್ಯುಲೇಟರ್",
  "queue.simulate.description":
    "ಓದಲು ಮಾತ್ರ ಇರುವ ಸೇವಾ ಲೆಕ್ಕಾಚಾರದಿಂದ ಸರದಿಯ ವಿನಂತಿ ಅಥವಾ ಈಗಾಗಲೇ ಮಾನ್ಯವಾದ ಕರಡನ್ನು ಹೋಲಿಸಿ.",
  "queue.simulate.only": "ಸಿಮ್ಯುಲೇಷನ್ ಮಾತ್ರ — ಯಾವುದೇ ಬದಲಾವಣೆ ಅನ್ವಯಿಸಿಲ್ಲ",
  "queue.simulate.approval":
    "ತುರ್ತು ಸೇವೆಗೆ ಪ್ರತ್ಯೇಕ ನಿಜವಾದ ವಿನಂತಿ ಮತ್ತು ಅನುಮೋದನೆ ಅಗತ್ಯ. ಕರಡುಗಳನ್ನು ಇನ್ನೂ ಸಲ್ಲಿಸಬೇಕು. ಈ ಫಲಿತಾಂಶಗಳು ಯಾವುದನ್ನೂ ಕಾಯ್ದಿರಿಸುವುದಿಲ್ಲ.",
  "queue.simulate.baseline": "ಪ್ರಸ್ತುತ ಅಂದಾಜು",
  "queue.simulate.hypothetical": "ಕಾಲ್ಪನಿಕ ಅಂದಾಜು",
  "queue.simulate.deltas": "ಅಂದಾಜು ಬದಲಾವಣೆಗಳು",
  "queue.simulate.deltaExplanation":
    "ಕಾಲ್ಪನಿಕ ಅಂದಾಜಿನಿಂದ ಪ್ರಸ್ತುತ ಅಂದಾಜನ್ನು ಕಳೆಯಲಾಗಿದೆ. ಋಣಾತ್ಮಕ ಮೌಲ್ಯ ಇಳಿಕೆಯನ್ನು ಸೂಚಿಸುತ್ತದೆ; ತಿಳಿಯದ ಮೌಲ್ಯಗಳು ಲಭ್ಯವಿರುವುದಿಲ್ಲ.",
  "queue.simulate.costDelta": "ವೆಚ್ಚದ ಬದಲಾವಣೆ",
  "queue.simulate.waitDelta": "ಕಾಯುವಿಕೆಯ ಬದಲಾವಣೆ",
  "queue.simulate.pickupDelta": "ಸಿದ್ಧ ಸಮಯದ ಬದಲಾವಣೆ",
  "queue.simulate.refreshNeeded":
    "ಮೂಲ ಸ್ಥಿತಿ ಬದಲಾಗಿದೆ ಅಥವಾ ಹೊಂದಿಸಲಿಲ್ಲ. ಪ್ರಸ್ತುತ ಆವೃತ್ತಿಯಿಂದ ಮೂಲ ಅಂದಾಜು ಪಡೆಯಲು ಸಿಮ್ಯುಲೇಷನ್ ಮತ್ತೆ ಚಲಾಯಿಸಿ.",
  "queue.simulate.loading": "ಓದಲು ಮಾತ್ರ ಇರುವ ಸನ್ನಿವೇಶದ ಲೆಕ್ಕಾಚಾರ ನಡೆಯುತ್ತಿದೆ…",
  "queue.simulate.unavailable":
    "ಈ ಸೇವೆ ಈಗ ಈ ಸಿಮ್ಯುಲೇಷನ್ ಒದಗಿಸಲಾಗುವುದಿಲ್ಲ. ಯಾವುದೇ ಬದಲಾವಣೆ ಅನ್ವಯಿಸಿಲ್ಲ.",
  "queue.simulate.draftLoading": "ಉಳಿಸದೆ ಈಗಿರುವ ಕರಡನ್ನು ಓದಲಾಗುತ್ತಿದೆ…",
  "queue.simulate.draftUnavailable":
    "ಕೋರಿದ ಕರಡು ಕಾಣೆಯಾಗಿದೆ, ಅಪೂರ್ಣವಾಗಿದೆ ಅಥವಾ ಈ ಸ್ಥಳೀಯ ದತ್ತಾಂಶದಲ್ಲಿ ಈಗ ಮಾನ್ಯವಾಗಿಲ್ಲ.",
  "queue.simulate.empty": "ಅರ್ಹ ಸನ್ನಿವೇಶದ ಗುರಿ ಇಲ್ಲ",
  "queue.simulate.noDraftCreation":
    "ಸರದಿಯ ಕೆಲಸವನ್ನು ಆಯ್ಕೆಮಾಡಿ ಅಥವಾ ಹೊಸ ಮುದ್ರಣದಲ್ಲಿ ಮಾನ್ಯ ಕರಡು ತಯಾರಿಸಿ. ಸಿಮ್ಯುಲೇಟರ್ ಕರಡುಗಳನ್ನು ರಚಿಸುವುದಿಲ್ಲ ಅಥವಾ ಉಳಿಸುವುದಿಲ್ಲ.",
  "queue.simulate.target": "ಸನ್ನಿವೇಶದ ಗುರಿ",
  "queue.simulate.choose": "ಸರದಿಯ ಕೆಲಸ ಅಥವಾ ಈಗಿರುವ ಕರಡು ಆಯ್ಕೆಮಾಡಿ",
  "queue.simulate.currentDraft": "ಪ್ರಸ್ತುತ ಉಳಿಸಿದ ಕರಡು",
  "queue.simulate.targetUnavailable":
    "ಅರ್ಹ ಸರದಿ ಕೆಲಸ ಅಥವಾ ಮಾನ್ಯ ಉಳಿಸಿದ ಕರಡನ್ನು ಆಯ್ಕೆಮಾಡಿ. ಆರಂಭವಾದ ಮತ್ತು ಮುಗಿದ ಕೆಲಸಗಳನ್ನು ಕಾಲ್ಪನಿಕವಾಗಿ ಸಂಪಾದಿಸಲಾಗುವುದಿಲ್ಲ.",
  "queue.simulate.draftReadOnly":
    "ಈ ಕರಡು ಇಲ್ಲಿ ಓದಲು ಮಾತ್ರ. ಅದರ ಕ್ಷೇತ್ರಗಳು ಮತ್ತು ಆಯ್ಕೆ ಮಾಡಿದ ಕಡತ ಬದಲಾಗುವುದಿಲ್ಲ.",
  "queue.simulate.urgent": "ತುರ್ತು ವಿನಂತಿಯ ಮುನ್ನೋಟ",
  "queue.simulate.printer": "ಪ್ರಿಂಟರ್ ಸನ್ನಿವೇಶ",
  "queue.simulate.keepPrinter": "ಪ್ರಸ್ತುತ ಪ್ರಿಂಟರ್ ಲಭ್ಯತೆ ಉಳಿಸಿ",
  "queue.simulate.recovery": "ಚೇತರಿಕೆ ಅಂದಾಜು",
  "queue.simulate.known": "ತಿಳಿದ ಉಳಿದ ಸ್ಥಗಿತ ಸಮಯ",
  "queue.simulate.unknown": "ಚೇತರಿಕೆ ಸಮಯ ತಿಳಿದಿಲ್ಲ",
  "queue.simulate.minutes": "ಸ್ಥಗಿತದ ನಿಮಿಷಗಳು",
  "queue.simulate.minutesHelp":
    "ಸ್ಥಿತಿಯ ಸಮಯದಿಂದ ಧನಾತ್ಮಕ ದಶಮಾಂಶ ನಿಮಿಷಗಳನ್ನು ನಮೂದಿಸಿ. ಇದು ಕಾಲ್ಪನಿಕ ಸ್ಥಗಿತವನ್ನು ಬದಲಿಸುತ್ತದೆ; ಎರಡು ಬಾರಿ ಸೇರಿಸುವುದಿಲ್ಲ.",
  "queue.simulate.run": "ಸಿಮ್ಯುಲೇಷನ್ ಚಲಾಯಿಸಿ",
  "queue.simulate.controlsChanged":
    "ಸನ್ನಿವೇಶದ ಆಯ್ಕೆಗಳು ಬದಲಾಗಿವೆ. ಈ ಆಯ್ಕೆಗಳನ್ನು ಹೋಲಿಸಲು ಸಿಮ್ಯುಲೇಷನ್ ಮತ್ತೆ ಚಲಾಯಿಸಿ.",
};
