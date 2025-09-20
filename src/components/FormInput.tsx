import { FC, InputHTMLAttributes } from 'react';

// We use InputHTMLAttributes to get all the standard props of an <input> element (like placeholder, type, etc.)
interface Props extends InputHTMLAttributes<HTMLInputElement> {
    label: string;
    id: string;
}

export const FormInput: FC<Props> = ({ label, id, ...props }) => {
    return (
        <div>
            <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1">
                {label}
            </label>
            <input
                id={id}
                {...props}
                className="block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
        </div>
    );
};
