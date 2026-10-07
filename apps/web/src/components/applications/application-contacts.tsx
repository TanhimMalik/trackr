"use client";

import { CONTACT_TYPE_LABELS, CONTACT_TYPES } from "@trackr/domain";
import { Ellipsis, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  createContactAction,
  deleteContactAction,
  updateContactAction,
} from "@/app/(app)/applications/detail-actions";
import { ConfirmDeleteDialog } from "@/components/forms/confirm-delete-dialog";
import { DialogForm, FormDialog } from "@/components/forms/form-dialog";
import { FormField } from "@/components/forms/form-field";
import { optionsFrom, SelectField } from "@/components/forms/select-field";
import { useFormAction } from "@/components/forms/use-form-action";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { initials } from "@/lib/format";
import type { Contact } from "@/server/db/types";

/** The people involved in an application: recruiters, interviewers and so on. */
export function ApplicationContacts({
  applicationId,
  contacts,
}: {
  applicationId: string;
  contacts: Contact[];
}) {
  const [adding, setAdding] = useState(false);

  return (
    <section aria-labelledby="contacts-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="contacts-heading" className="font-semibold">
          Contacts
        </h3>
        <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" />
          Add contact
        </Button>
      </div>
      {contacts.length === 0 ? (
        <p className="text-muted-foreground">No contacts yet.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {contacts.map((contact) => (
            <ContactRow key={contact.id} contact={contact} />
          ))}
        </ul>
      )}
      <ContactDialog
        open={adding}
        onOpenChange={setAdding}
        applicationId={applicationId}
      />
    </section>
  );
}

function ContactRow({ contact }: { contact: Contact }) {
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const role = CONTACT_TYPE_LABELS[contact.contactType];
  // Skip the role when the job title already says it ("Recruiter").
  const details = [
    contact.title,
    contact.title?.toLowerCase() === role.toLowerCase() ? null : role,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Avatar size="sm">
        <AvatarFallback className="text-xs font-medium">
          {initials(contact.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{contact.name}</p>
        <p className="truncate text-muted-foreground">
          {details}
          {contact.email && (
            <>
              {" · "}
              <a
                href={`mailto:${contact.email}`}
                className="text-primary-text underline-offset-4 hover:underline"
              >
                {contact.email}
              </a>
            </>
          )}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${contact.name}`}
          >
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDialog("delete")}
          >
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ContactDialog
        open={dialog === "edit"}
        onOpenChange={(open) => setDialog(open ? "edit" : null)}
        contact={contact}
      />
      <ConfirmDeleteDialog
        open={dialog === "delete"}
        onOpenChange={(open) => setDialog(open ? "delete" : null)}
        title={`Delete ${contact.name}?`}
        description="They'll be removed from this application's contacts and from any interview they're linked to."
        onConfirm={() => deleteContactAction(contact.id)}
      />
    </li>
  );
}

function ContactDialog({
  open,
  onOpenChange,
  applicationId,
  contact,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** For adding; editing uses the contact's own application. */
  applicationId?: string;
  contact?: Contact;
}) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={contact ? "Edit contact" : "Add contact"}
    >
      <ContactForm
        applicationId={applicationId}
        contact={contact}
        onClose={() => onOpenChange(false)}
      />
    </FormDialog>
  );
}

function ContactForm({
  applicationId,
  contact,
  onClose,
}: {
  applicationId?: string;
  contact?: Contact;
  onClose: () => void;
}) {
  const action = contact
    ? updateContactAction.bind(null, contact.id)
    : createContactAction.bind(null, applicationId ?? "");
  const { onSubmit, pending, errors, formError } = useFormAction(action, {
    onSuccess: (result) => {
      toast.success(result.message);
      onClose();
    },
  });

  return (
    <DialogForm
      onSubmit={onSubmit}
      onCancel={onClose}
      submitLabel={contact ? "Save changes" : "Add contact"}
      pendingLabel={contact ? "Saving…" : "Adding…"}
      pending={pending}
      formError={formError}
    >
      <FormField label="Name" error={errors.name}>
        {(control) => (
          <Input
            {...control}
            name="name"
            autoComplete="off"
            autoFocus
            defaultValue={contact?.name}
          />
        )}
      </FormField>
      <SelectField
        label="Role"
        name="contactType"
        defaultValue={contact?.contactType ?? "RECRUITER"}
        options={optionsFrom(CONTACT_TYPES, CONTACT_TYPE_LABELS)}
        error={errors.contactType}
      />
      <FormField label="Job title" error={errors.title}>
        {(control) => (
          <Input
            {...control}
            name="title"
            autoComplete="off"
            placeholder="Technical Recruiter"
            defaultValue={contact?.title ?? undefined}
          />
        )}
      </FormField>
      <FormField label="Email" error={errors.email}>
        {(control) => (
          <Input
            {...control}
            name="email"
            type="email"
            autoComplete="off"
            defaultValue={contact?.email ?? undefined}
          />
        )}
      </FormField>
    </DialogForm>
  );
}
