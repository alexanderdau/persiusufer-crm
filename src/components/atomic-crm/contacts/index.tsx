import type { Contact } from "../types";
import { ContactCreate } from "./ContactCreate";
import { ContactEdit } from "./ContactEdit";
import { ContactList } from "./ContactList";
import { ContactShow } from "./ContactShow";

export default {
  list: ContactList,
  show: ContactShow,
  edit: ContactEdit,
  create: ContactCreate,
  recordRepresentation: (record: Contact) => {
    const parts = [record?.first_name, record?.last_name].filter(Boolean);
    const name = parts.join(" ").trim() || "—";
    return record?.title ? `${record.title} ${name}` : name;
  },
};
