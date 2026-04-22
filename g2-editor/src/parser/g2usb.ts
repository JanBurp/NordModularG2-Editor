export class G2USB {
  connected: boolean;
  onMessage: ((data: number[]) => void) | null;
  device: USBDevice | null;

  private G2_VENDOR_ID = 0x0ffc;
  private G2_PRODUCT_ID = 2;

  private bulkOutEndpoint = 0;
  private bulkInEndpoint = 0;
  private interruptInEndpoint = 0;

  private receiveLoopRunning = false;
  private receiveBuffer: number[] = [];

  constructor() {
    this.connected = false;
    this.onMessage = null;
    this.device = null;
  }

  async connect(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.usb) {
      throw new Error('WebUSB not available in this browser');
    }

    console.log('Requesting G2 device via WebUSB...');

    let device: USBDevice | undefined;

    try {
      const allDevices = await navigator.usb.getDevices();
      console.log('All USB devices:', allDevices.map(d => `${d.productName || 'Unknown'} VID:${d.vendorId} PID:${d.productId}`));

      const g2Devices = allDevices.filter(d => d.vendorId === this.G2_VENDOR_ID && d.productId === this.G2_PRODUCT_ID);

      if (g2Devices.length > 0) {
        console.log('Found previously paired G2 device(s):', g2Devices.length);
        device = g2Devices[0];
      } else {
        console.log('No G2 found in paired devices, requesting new device...');
        device = await navigator.usb.requestDevice({
          filters: [{
            vendorId: this.G2_VENDOR_ID,
            productId: this.G2_PRODUCT_ID
          }]
        });
      }
    } catch (error: any) {
      if (error.name === 'NotFoundError' || error.name === 'AbortError') {
        console.log('Device selection cancelled or no device found');
        throw new Error('No device selected. Please select your Nord Modular G2 from the list.');
      }
      throw error;
    }

    if (!device) {
      throw new Error('No device selected. Make sure your Nord Modular G2 is connected via USB and click Connect again.');
    }

    console.log('G2 device:', device.productName || 'Unknown device', 'Serial:', device.serialNumber);
    console.log('  VendorID:', device.vendorId, 'ProductID:', device.productId);
    console.log('  Configurations:', device.configurations?.length);

    this.device = device;

    await device.open();
    console.log('Device opened');

    console.log('Selecting configuration...');
    await device.selectConfiguration(1);
    console.log('Configuration selected');

    try {
      console.log('Attempting device reset...');
      await device.reset();
      console.log('Device reset successful');
      
      if (device.configuration === null) {
        console.log('Re-selecting configuration after reset...');
        await device.selectConfiguration(1);
      }
    } catch (e) {
      console.log('Device reset not available or failed:', e);
    }

    console.log('Reading endpoints from configuration...');
    const config = device.configuration;
    if (config) {
      for (const iface of config.interfaces) {
        console.log('  Interface:', iface.interfaceNumber, 'Alternates:', iface.alternates?.length);
        for (const alt of iface.alternates || []) {
          console.log('    Endpoints:', alt.endpoints?.map(e =>
            `ep${e.endpointNumber}(${e.direction},${e.type})`
          ).join(', '));
          
          for (const ep of alt.endpoints || []) {
            if (ep.type === 'bulk' && ep.direction === 'out') {
              this.bulkOutEndpoint = ep.endpointNumber;
              console.log('    Bulk OUT: ep', ep.endpointNumber);
            } else if (ep.type === 'bulk' && ep.direction === 'in') {
              this.bulkInEndpoint = ep.endpointNumber;
              console.log('    Bulk IN: ep', ep.endpointNumber);
            } else if (ep.type === 'interrupt' && ep.direction === 'in') {
              this.interruptInEndpoint = ep.endpointNumber;
              console.log('    Interrupt IN: ep', ep.endpointNumber);
            }
          }
        }
      }
    }

    console.log('Using endpoints:', {
      bulkOut: this.bulkOutEndpoint,
      bulkIn: this.bulkInEndpoint,
      interruptIn: this.interruptInEndpoint
    });

    const iface = device.configuration.interfaces[0];
    if (iface.alternates.length > 1) {
      console.log('Selecting alternate setting...');
      await device.selectAlternateInterface(0, 1);
      console.log('Alternate setting selected');
    }

    await device.claimInterface(0);
    console.log('Interface claimed');

    await this.startProtocol();

    this.connected = true;
    console.log('G2 connected successfully');
    return true;
  }

  async disconnect(): Promise<void> {
    this.receiveLoopRunning = false;

    if (this.device) {
      try {
        if (this.device.opened) {
          await this.device.releaseInterface(0);
          await this.device.close();
        }
      } catch (e) {
        console.error('Error during disconnect:', e);
      }
      this.device = null;
    }

    this.connected = false;
  }

  async startProtocol(): Promise<void> {
    if (!this.device) {
      throw new Error('No device');
    }

    console.log('Starting G2 protocol...');

    const initData = this.buildInitMessage();
    console.log('Sending init:', initData.map(b => b.toString(16).padStart(2, '0')).join(' '));
    await this.sendInternal(initData);
    console.log('Init command sent');
    await this.delay(100);

    const initResp = await this.readResponse(2000);
    console.log('Init response:', initResp ? initResp.map(b => b.toString(16).padStart(2, '0')).join(' ') : 'none');

    await this.delay(100);

    const stopData = this.buildStopMessage();
    console.log('Sending stop:', stopData.map(b => b.toString(16).padStart(2, '0')).join(' '));
    await this.sendInternal(stopData);
    console.log('Stop command sent');
    await this.delay(100);

    const stopResp = await this.readResponse(2000);
    console.log('Stop response:', stopResp ? stopResp.map(b => b.toString(16).padStart(2, '0')).join(' ') : 'none');

    await this.delay(100);

    const settingsData = this.buildGetSynthSettingsMessage();
    console.log('Sending get synth settings:', settingsData.map(b => b.toString(16).padStart(2, '0')).join(' '));
    await this.sendInternal(settingsData);
    console.log('Get synth settings sent');
    await this.delay(100);

    const settingsResp = await this.readResponse(2000);
    console.log('Settings response:', settingsResp ? settingsResp.map(b => b.toString(16).padStart(2, '0')).join(' ') : 'none');

    await this.delay(100);

    const startData = this.buildStartMessage();
    console.log('Sending start:', startData.map(b => b.toString(16).padStart(2, '0')).join(' '));
    await this.sendInternal(startData);
    console.log('Start command sent');

    this.startReceiveLoop();
  }

  private async readResponse(timeout: number): Promise<number[] | null> {
    if (!this.device) return null;

    const tryEndpoint = async (endpoint: number, timeoutMs: number) => {
      try {
        console.log('Reading from endpoint:', endpoint);
        const result = await this.device.transferIn(endpoint, timeoutMs);
        console.log('Transfer result:', result.status, 'bytes:', result.data?.byteLength);
        if (result.data && result.data.byteLength > 0) {
          return Array.from(new Uint8Array(result.data));
        }
      } catch (e: any) {
        console.log('Transfer error on endpoint', endpoint, ':', e.name || e.message);
      }
      return null;
    };

    const endTime = Date.now() + timeout;
    while (Date.now() < endTime) {
      let data = await tryEndpoint(this.interruptInEndpoint, 500);
      if (data) return data;
      data = await tryEndpoint(this.bulkInEndpoint, 500);
      if (data) return data;
    }
    console.log('No response received within', timeout, 'ms');
    return null;
  }

  startReceiveLoop(): void {
    if (this.receiveLoopRunning) return;

    this.receiveLoopRunning = true;
    this.receiveAsync();
  }

  private async receiveAsync(): Promise<void> {
    console.log('Receive loop starting, device opened:', this.device?.opened);

    while (this.receiveLoopRunning && this.device && this.device.opened) {
      try {
        console.log('Waiting for data on bulk endpoint...');
        const result = await this.device.transferIn(this.bulkInEndpoint, 5000);
        console.log('Bulk result:', result.status, 'bytes:', result.data?.byteLength);

        if (result.data && result.data.byteLength > 0) {
          const bytes = new Uint8Array(result.data);
          const dataArray = Array.from(bytes);

          console.log('G2-> (bulk):', dataArray.slice(0, 20).map(b => b.toString(16).padStart(2, '0')).join(' '));

          this.handleIncomingMessage(dataArray);
        }
      } catch (bulkError: any) {
        console.log('Bulk error:', bulkError.name);
      }

      try {
        console.log('Waiting for data on interrupt endpoint...');
        const intResult = await this.device.transferIn(this.interruptInEndpoint, 1000);
        console.log('Interrupt result:', intResult.status, 'bytes:', intResult.data?.byteLength);

        if (intResult.data && intResult.data.byteLength > 0) {
          const bytes = new Uint8Array(intResult.data);
          const dataArray = Array.from(bytes);

          console.log('G2-> (int):', dataArray.slice(0, 20).map(b => b.toString(16).padStart(2, '0')).join(' '));

          this.handleIncomingMessage(dataArray);
        }
      } catch (intError: any) {
        console.log('Interrupt error:', intError.name);
      }

      if (!this.receiveLoopRunning) {
        console.log('Receive loop stopped');
        break;
      }

      await this.delay(50);
    }
    console.log('Receive loop ended');
  }

  private handleIncomingMessage(data: number[]): void {
    console.log('G2->:', data.slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join(' '));
    
    if (this.onMessage) {
      this.onMessage(data);
    }

    this.receiveBuffer.push(...data);
  }

  private async sendInternal(data: number[]): Promise<void> {
    if (!this.device || !this.device.opened) {
      throw new Error('Device not open');
    }

    console.log('Sending:', data.map(b => b.toString(16).padStart(2, '0')).join(' '));
    const buffer = new Uint8Array(data);
    await this.device.transferOut(this.bulkOutEndpoint, buffer);
  }

  async send(data: number | number[]): Promise<void> {
    if (!this.connected || !this.device) {
      throw new Error('G2 not connected');
    }

    const buffer = Array.isArray(data) ? data : [data];
    await this.sendInternal(buffer);
  }

  async sendSysex(data: number[]): Promise<void> {
    const sysex = [0xF0, ...data, 0xF7];
    await this.send(sysex);
  }

  async sendIdentityRequest(): Promise<void> {
    await this.sendSysex([0x7E, 0x7F, 0x06, 0x01]);
  }

  async sendPatchData(patchData: number[]): Promise<void> {
    const chunkSize = 60;

    for (let i = 0; i < patchData.length; i += chunkSize) {
      const chunk = patchData.slice(i, i + chunkSize);
      await this.sendSysex(chunk);
      await this.delay(10);
    }
  }

  delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  parseSysexMessage(data: number[]): number[] | null {
    if (data[0] !== 0xF0 || data[data.length - 1] !== 0xF7) {
      return null;
    }
    return data.slice(1, -1);
  }

  isIdentityReply(data: number[]): boolean {
    return data.length >= 8 &&
           data[0] === 0x7E &&
           data[3] === 0x06 &&
           data[4] === 0x02;
  }

  isG2Response(data: number[]): boolean {
    return data.length >= 4 && data[0] === 0x00 && data[1] === 0x21;
  }

  async getDeviceInfo(): Promise<{ connected: boolean; vendorId: number; productId: number }> {
    if (!this.device || !this.connected) {
      return { connected: false, vendorId: 0, productId: 0 };
    }

    return {
      connected: true,
      vendorId: this.device.vendorId,
      productId: this.device.productId
    };
  }

  private crcIterator(seed: number, val: number): number {
    let crc = 0;
    let k = ((seed >> 8) ^ val) & 255;
    k = k << 8;

    for (let i = 0; i < 8; i++) {
      if ((crc ^ k) & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
      k = k << 1;
    }

    return ((seed << 8) ^ crc) & 0xffff;
  }

  private calcCRC16(data: number[], length: number): number {
    let crc = 0;
    for (let i = 0; i < length; i++) {
      crc = this.crcIterator(crc, data[i]);
    }
    return crc;
  }

  private buildInitMessage(): number[] {
    const payload = [0x80];
    const crc = this.calcCRC16(payload, payload.length);
    const msgLen = payload.length + 2;
    const data = [(msgLen >> 8) & 0xff, msgLen & 0xff, ...payload, (crc >> 8) & 0xff, crc & 0xff];
    return data;
  }

  private buildStopMessage(): number[] {
    const payload = [0x01, 0x2c, 0x41, 0x7d, 0x01];
    const crc = this.calcCRC16(payload, payload.length);
    const msgLen = payload.length + 2;
    const data = [(msgLen >> 8) & 0xff, msgLen & 0xff, ...payload, (crc >> 8) & 0xff, crc & 0xff];
    return data;
  }

  private buildStartMessage(): number[] {
    const payload = [0x01, 0x2c, 0x41, 0x7d, 0x00];
    const crc = this.calcCRC16(payload, payload.length);
    const msgLen = payload.length + 2;
    const data = [(msgLen >> 8) & 0xff, msgLen & 0xff, ...payload, (crc >> 8) & 0xff, crc & 0xff];
    return data;
  }

  private buildGetSynthSettingsMessage(): number[] {
    const payload = [0x01, 0x2c, 0x41, 0x02];
    const crc = this.calcCRC16(payload, payload.length);
    const msgLen = payload.length + 2;
    const data = [(msgLen >> 8) & 0xff, msgLen & 0xff, ...payload, (crc >> 8) & 0xff, crc & 0xff];
    return data;
  }
}

export function isG2Supported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.usb;
}

export async function getConnectedG2Devices(): Promise<USBDevice[]> {
  if (typeof navigator === 'undefined' || !navigator.usb) {
    return [];
  }

  const devices = await navigator.usb.getDevices();
  return devices.filter(d => d.vendorId === 0x0ffc && d.productId === 2);
}