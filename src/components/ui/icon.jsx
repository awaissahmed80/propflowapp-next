import { cn } from "@/lib/utils";


export const Icon = ({ name, className, ...rest}) => {

    const icon_name = `icon ri-${name}`;

    return(
        <i className={cn(icon_name, className)} {...rest} />
    )
}
