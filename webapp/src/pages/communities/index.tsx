import { useQuery } from '@tanstack/react-query'
import { useAuth } from '~components/Auth/useAuth'
import { Check } from '~components/Check'
import { CommunitiesList } from '~components/Communities'
import { fetchCommunities } from '~queries/communities'

const AllCommunitiesList = () => {
  const { bfetch } = useAuth()
  const { data, error, isLoading } = useQuery({
    queryKey: ['communities'],
    queryFn: fetchCommunities(bfetch),
  })

  if (error || isLoading) {
    return <Check error={error} isLoading={isLoading} />
  }

  if (!data) return

  return <CommunitiesList data={data} />
}

export default AllCommunitiesList
