import {
  Camera,
  CameraSwitchControl,
  DataCaptureView,
  FrameSourceState,
  configure,
  loadingStatus,
  DataCaptureContext,
} from "scandit-web-datacapture-core";
import type { Barcode, BarcodeCaptureSession } from "scandit-web-datacapture-barcode";
import {
  BarcodeCapture,
  BarcodeCaptureSettings,
  Symbology,
  barcodeCaptureLoader,
} from "scandit-web-datacapture-barcode";
import type { LoadingStatusSubscriber, ProgressInfo } from "scandit-web-datacapture-core";

// Main DOM elements in the page.
const pageElements = {
  input: document.getElementById("input") as HTMLInputElement,
  button: document.getElementById("scan") as HTMLInputElement,
  modalContainer: document.getElementById("modal") as HTMLInputElement,
  modal: document.querySelector("#modal .modal-inner") as HTMLInputElement,
  backdrop: document.querySelector("#modal .backdrop")!,
  captureHost: document.getElementById("data-capture-view")!,
};

async function run(): Promise<void> {
  // Keep a reference to the context object.
  let context: DataCaptureContext;
  // Keep a reference to the barcode capture mode object.
  let barcodeCapture: BarcodeCapture;

  const updateUIWithProgress: LoadingStatusSubscriber = (info: ProgressInfo) => {
    if (info.percentage != null) {
      pageElements.input.value = `Loading... ${info.percentage}%`;
    }
    if (info.percentage === 100) {
      pageElements.input.value = ``;
    }
  };

  async function loadAndPrepareLibrary(): Promise<void> {
    // Subscribe to the loading status and update UI accordingly
    loadingStatus.subscribe(updateUIWithProgress);

    // There is a Scandit sample license key set below here.
    // This license key is enabled for sample evaluation only.
    // If you want to build your own application, get your license key by signing up for a trial at https://ssl.scandit.com/dashboard/sign-up?p=test
    // The passed parameter represents the location of the wasm file, which will be fetched asynchronously.
    // You must `await` the returned promise to be able to continue.
    await configure({
      licenseKey: "AfUkdmKlRiP5FdlOFQnOhu4V3j5LFKttPGTWXFd7CkuRaTAstDqq78RrBm2ZG9LRu1T8CNgP6oLScGrUoEwfmP1TUXonIGCl2g9Fo5NYtmK/aEV8FX/YcdRKfWS5bJrTcWGDHdcsJxT6Me5C3RMdWZkdqeR5GEjDzT6dO4ZPWOBbNLjpkgZ0/MjtYQPKqSV+bSZC7+ekFaXovSKWfXV89BXtta/6sZHFJOMKxyvzh6zw5yA+NDR67OXoWKCrrNq4AOuBlt1ZelIHCqjQgTy/SZG110eJr5e4pth38Bx0fXE8FGX92BoxwJr1EG+P5CEJF8EFMy2zf87aJQYuzHmg0nM7czcNqLUd9F23uxntZYjKlwgWmmSzev/ozaumEvbW9RVW1bUQmV8pQ1SWILBuzQPeAw8iWOWgnTH18tH7cT+fUJumvM2rn7LWx9JYLAKBKRuwe2sDh3l5eqobZKdarIRsKVgXa4pw+gkYKuplzTo+Bzh70rbmtgq3IJ8hSpdoZITzfUQSwXkrgdQa5Cmrpxz9gXManBRt01h3eFXG7znZU9w0+uzzV/b5e6MQcPncODrCQOq0kfEBYgRoLAwVCOKnxyWQkqRbUpsTN2wy2MTg10flYhR/zf1eXdiUjgPUhWj8LtmgxJELYky7uMu46abfCkAw73e+12iJmlf9/tmTFk34La9ZQiF/BYps5h327ZW8qobay+Esx1i9dsaFKYt/nCN8jZdUYD/df+/vApyK4PMbph9EPRe5u0alg8BqpEExnkQsy1W7r85yngO/rxSXsY6rTMoTXb/87ul8uQnsrD41ZLtFdzo0OlbNTeNOI1mJz/E6/SOLbRRK",
      libraryLocation: new URL("../../library/engine/", document.baseURI).toString(),
      moduleLoaders: [barcodeCaptureLoader()],
    });

    // Unsubscribe to the loading status updates
    loadingStatus.unsubscribe(updateUIWithProgress);

    // Create the data capture context.
    context = await DataCaptureContext.create();

    // Try to use the world-facing (back) camera and set it as the frame source of the context. The camera is off by
    // default and must be turned on to start streaming frames to the data capture context for recognition.
    await context.setFrameSource(Camera.default);

    // The barcode capturing process is configured through barcode capture settings,
    // they are then applied to the barcode capture instance that manages barcode recognition.
    const settings: BarcodeCaptureSettings = new BarcodeCaptureSettings();

    // The settings instance initially has all types of barcodes (symbologies) disabled. For the purpose of this
    // sample we enable a very generous set of symbologies. In your own app ensure that you only enable the
    // symbologies that your app requires as every additional enabled symbology has an impact on processing times.
    settings.enableSymbologies([
      Symbology.EAN13UPCA,
      Symbology.EAN8,
      Symbology.UPCE,
      Symbology.QR,
      Symbology.DataMatrix,
      Symbology.Code39,
      Symbology.Code128,
      Symbology.InterleavedTwoOfFive,
    ]);

    // Create a new barcode capture mode with the settings from above.
    barcodeCapture = await BarcodeCapture.forContext(context, settings);
    // Disable the barcode capture mode until the camera is accessed.
    await barcodeCapture.setEnabled(false);

    // Register a listener to get informed whenever a new barcode got recognized.
    barcodeCapture.addListener({ didScan });

    // To visualize the ongoing barcode capturing process on screen, set up a data capture view that renders the
    // camera preview. The view must be connected to the data capture context.
    const view = await DataCaptureView.forContext(context);

    // Connect the data capture view to the HTML element.
    view.connectToElement(pageElements.captureHost);

    // Add a control to be able to switch cameras.
    view.addControl(new CameraSwitchControl());
  }

  const waitTransition = async (element: HTMLElement): Promise<void> =>
    new Promise<void>((resolve) => {
      element.addEventListener(
        "transitionend",
        () => {
          resolve();
        },
        { once: true }
      );
    });

  // Close the modal and switch off the camera.
  async function closeModal(): Promise<void> {
    pageElements.modalContainer.classList.remove("open");
    await waitTransition(pageElements.modal);
    await context.frameSource!.switchToDesiredState(FrameSourceState.Off);
    pageElements.button.disabled = false;
    pageElements.button.textContent = "Click to Scan";
  }

  async function openModal(): Promise<void> {
    pageElements.modalContainer.classList.add("open");

    await waitTransition(pageElements.modal);
  }

  // Open our modal and start the camera to scan a barcode.
  async function onOpenModal(): Promise<void> {
    pageElements.input.blur();
    // Start the camera. This can potentially fail, so we use try/catch.
    try {
      pageElements.button.textContent = "Loading...";
      pageElements.button.disabled = true;
      await context.frameSource!.switchToDesiredState(FrameSourceState.On);
      await openModal();
      await barcodeCapture.setEnabled(true);
    } catch (error: unknown) {
      const reason: string =
        typeof error === "object" && error != null && typeof error["toString"] === "function"
          ? error.toString()
          : "unknown error";
      alert(`Could not start camera: ${reason}`);
      pageElements.input.placeholder = reason;
      await closeModal();
    }
  }

  // When a scan happened, we populate the input and close the modal.
  async function didScan(barcodeCaptureMode: BarcodeCapture, session: BarcodeCaptureSession): Promise<void> {
    await barcodeCapture.setEnabled(false);
    const barcode: Barcode = session.newlyRecognizedBarcodes[0];
    await closeModal();
    pageElements.input.value = barcode.data ?? "";
  }

  // Load the library as soon as possible. This will make the user experience faster.
  await loadAndPrepareLibrary();
  pageElements.button.disabled = false;
  pageElements.input.disabled = false;
  pageElements.input.placeholder = "Barcodes will appear here";

  // At this point the library was loaded, set up the UI elements (progressive enhancement).
  pageElements.button.addEventListener("click", onOpenModal);
  pageElements.backdrop.addEventListener("click", closeModal);
  pageElements.input.addEventListener("focus", () => {
    pageElements.input.setSelectionRange(0, pageElements.input.value.length);
  });
  document.addEventListener("keydown", async (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      await closeModal();
    }
  });
}

run().catch((error) => {
  console.error(error);
  alert(JSON.stringify(error, null, 2));
  pageElements.input.disabled = false;
  pageElements.input.placeholder = "Enter code manually";
});
