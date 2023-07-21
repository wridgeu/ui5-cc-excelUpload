import ManagedObject from "sap/ui/base/ManagedObject";
import DraftController from "sap/ui/generic/app/transaction/DraftController";
import { Columns, ListObject, Property } from "../../types";
import ODataMessageHandler from "../dialog/ODataMessageHandler";
import SpreadsheetUpload from "../SpreadsheetUpload";
import Log from "sap/base/Log";
import MetadataHandlerV2 from "./MetadataHandlerV2";
import MetadataHandlerV4 from "./MetadataHandlerV4";

/**
 * @namespace cc.spreadsheetimporter.XXXnamespaceXXX
 */
export default abstract class OData extends ManagedObject {
	UI5MinorVersion: number;
	draftController: DraftController;
	odataMessageHandler: ODataMessageHandler;
	private _tables: any[] = [];

	constructor(ui5version: number, spreadsheetUploadController: SpreadsheetUpload) {
		super();
		this.UI5MinorVersion = ui5version;
		this.odataMessageHandler = new ODataMessageHandler(spreadsheetUploadController);
	}

	/**
	 * Helper method to call OData service.
	 * @param {*} fnResolve - The resolve function for the Promise.
	 * @param {*} fnReject - The reject function for the Promise.
	 */
	async callOdata(fnResolve: any, fnReject: any, spreadsheetUploadController: SpreadsheetUpload): Promise<void> {
		const component = spreadsheetUploadController.component;
		const tableObject = spreadsheetUploadController.tableObject;
		const payloadArray = spreadsheetUploadController.payloadArray;
		const binding = spreadsheetUploadController.binding;
		const context = spreadsheetUploadController.context;

		// intializing the message manager for displaying the odata response messages
		try {
			// get binding of table to create rows
			const model = tableObject.getModel();

			// Slice the array into chunks of 'batchSize' if necessary
			const slicedPayloadArray = this.processPayloadArray(component.getBatchSize(), payloadArray);

			// Loop over the sliced array
			for (const batch of slicedPayloadArray) {
				// loop over data from spreadsheet file
				for (const payload of batch) {
					// Extension method to manipulate payload
					component.fireChangeBeforeCreate({ payload: payload });
					this.createAsync(model, binding, payload);
				}
				// wait for all drafts to be created
				await this.submitChanges(model);
				let errorsFound = await this.checkForErrors(model, binding, component.getShowBackendErrorMessages());
				if (errorsFound) {
					break;
				} else {
					await this.waitForCreation();
				}

				// check for and activate all drafts and wait for all draft to be created
				if (component.getActivateDraft() && !errorsFound) {
					await this.waitForDraft();
				}

				this.resetContexts();
			}
			spreadsheetUploadController.refreshBinding(context, binding, tableObject.getId());
			fnResolve();
		} catch (error) {
			this.resetContexts();
			Log.error("Error while calling the odata service", error as Error, "SpreadsheetUpload: callOdata");
			fnReject(error);
		}
	}

	public getBinding(tableObject: any): any {
		if (tableObject.getMetadata().getName() === "sap.m.Table" || tableObject.getMetadata().getName() === "sap.m.List") {
			return tableObject.getBinding("items");
		}
		if (tableObject.getMetadata().getName() === "sap.ui.table.Table") {
			return tableObject.getBinding("rows");
		}
	}

	public _getActionName(oContext: any, sOperation: string) {
		var oModel = oContext.getModel(),
			oMetaModel = oModel.getMetaModel(),
			sEntitySetPath = oMetaModel.getMetaPath(oContext.getPath());
		return oMetaModel.getObject("".concat(sEntitySetPath, "@com.sap.vocabularies.Common.v1.DraftRoot/").concat(sOperation));
	}

	// Slice the array into chunks of 'batchSize' if necessary
	public processPayloadArray(batchSize: number, payloadArray: string | any[]) {
		if (batchSize > 0) {
			let slicedPayloadArray = [];
			const numOfSlices = Math.ceil(payloadArray.length / batchSize);
			const equalSize = Math.ceil(payloadArray.length / numOfSlices);

			for (let i = 0; i < payloadArray.length; i += equalSize) {
				slicedPayloadArray.push(payloadArray.slice(i, i + equalSize));
			}
			return slicedPayloadArray;
		} else {
			return [payloadArray];
		}
	}

	public getTableObject(tableId: string, view: any) {
		// try get object page table
		if (!tableId) {
			this.tables = view.findAggregatedObjects(true, function (object: any) {
				return object.isA("sap.m.Table") || object.isA("sap.ui.table.Table");
			});
			if (this.tables.length > 1) {
				throw new Error("Found more than one table on Object Page.\n Please specify table in option 'tableId'");
			} else if (this.tables.length === 0) {
				throw new Error("Found more than one table on Object Page.\n Please specify table in option 'tableId'");
			} else {
				return this.tables[0];
			}
		} else {
			return view.byId(tableId);
		}
	}

	public get tables(): any[] {
		return this._tables;
	}
	public set tables(value: any[]) {
		this._tables = value;
	}

	abstract create(model: any, binding: any, payload: any): any;
	abstract createAsync(model: any, binding: any, payload: any): any;
	abstract submitChanges(model: any): Promise<any>;
	abstract waitForCreation(): Promise<any>;
	abstract waitForDraft(): void;
	abstract resetContexts(): void;
	abstract getView(context: any): any;
	abstract getMetadataHandler(): MetadataHandlerV2 | MetadataHandlerV4;
	abstract getLabelList(columns: Columns, odataType: string, tableObject: any): Promise<ListObject>;
	abstract getKeyList(odataType: string, tableObject: any): Promise<string[]>;
	abstract getOdataType(binding: any, tableObject: any, odataType: any): string;
	abstract checkForErrors(model: any, binding: any, showBackendErrorMessages: Boolean): Promise<boolean>;
	abstract createCustomBinding(binding: any): any;
}