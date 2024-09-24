export class InventoryItem {
  id: string;
  name: string;
  description: string;
  image: string;
  category: string;
  physicalLocation: string;
  digitalLocation: string;
  applicableYear: string;
  expirationDate: string;
  supplierName: string;
  supplierLeadTime: string;
  orderLink: string;
  quantityTotal: number;
  quantityPerContainer: number;
  quantityAllocated: number;
  quantityRemaining: number;
  lowQuantityThreshold: number;
  pricePerUnit: number;
  pricePerContainer: number;
  isCheckedOut: boolean;
  checkedOutTo: string;
  activityLog: string;

  constructor(
    id: string,
    name: string,
    description: string,
    image: string,
    category: string,
    physicalLocation: string,
    digitalLocation: string,
    applicableYear: string,
    expirationDate: string,
    supplierName: string,
    supplierLeadTime: string,
    orderLink: string,
    quantityTotal: number,
    quantityPerContainer: number,
    quantityAllocated: number,
    quantityRemaining: number,
    lowQuantityThreshold: number,
    pricePerUnit: number,
    pricePerContainer: number,
    isCheckedOut: boolean,
    checkedOutTo: string,
    activityLog: string
  ) {
    //Tracking
    this.id = id;

    //Item information
    this.name = name;
    this.description = description;
    this.image = image;
    this.category = category;
    this.physicalLocation = physicalLocation;
    this.digitalLocation = digitalLocation;
    this.applicableYear = applicableYear;
    this.expirationDate = expirationDate;

    //Supplier information
    this.supplierName = supplierName;
    this.supplierLeadTime = supplierLeadTime;
    this.orderLink = orderLink;

    //Quantity information
    this.quantityTotal = quantityTotal;
    this.quantityPerContainer = quantityPerContainer;
    this.quantityAllocated = quantityAllocated;
    this.quantityRemaining = quantityRemaining;
    this.lowQuantityThreshold = lowQuantityThreshold;

    //Price information
    this.pricePerUnit = pricePerUnit;
    this.pricePerContainer = pricePerContainer;

    //Other information
    this.isCheckedOut = isCheckedOut;
    this.checkedOutTo = checkedOutTo;
    this.activityLog = activityLog;
  }

}
