import { Field, FieldError } from '../ui/field.tsx'
import { OTPField, OTPFieldInput } from '../ui/otp-field.tsx'

export const CODE_LENGTH = 6

/** The six-digit TOTP entry every write dialog asks for; a full code submits itself. */
export const CodeField = ({
  value,
  error,
  disabled,
  onChange,
  onComplete,
}: {
  value: string
  error: string
  disabled: boolean
  onChange: (value: string) => void
  onComplete: () => void
}) => (
  <Field invalid={!!error}>
    <OTPField
      aria-label="动态码"
      length={CODE_LENGTH}
      required
      value={value}
      onValueChange={onChange}
      onValueComplete={onComplete}
      disabled={disabled}
      aria-invalid={!!error}
    >
      {Array.from({ length: CODE_LENGTH }, (_, index) => (
        <OTPFieldInput
          key={index}
          autoFocus={index === 0}
          aria-label={index === 0 ? undefined : `动态码第 ${index + 1} 位`}
        />
      ))}
    </OTPField>
    {error && <FieldError>{error}</FieldError>}
  </Field>
)
